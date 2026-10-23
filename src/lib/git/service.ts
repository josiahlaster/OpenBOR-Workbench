import './buffer';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import {
  add,
  branch,
  checkout,
  clone,
  commit,
  currentBranch,
  fetch,
  getConfig,
  listBranches,
  log,
  pull,
  push,
  setConfig,
  statusMatrix,
  updateIndex,
} from 'isomorphic-git';
import { getStoredToken, onAuthCallback } from './auth';
import { helpLines, parseCommandLine, repoNameFromUrl, shortSha } from './commands';

/** Public CORS proxy. Git hosts do not send CORS headers on their git endpoints. */
export const CORS_PROXY = 'https://cors.isomorphic-git.org';

const REPOS_ROOT = '/repos';
const FS_NAME = 'openbor-stats-git';
const CURRENT_REPO_KEY = 'openbor-stats-git-repo';
const MAX_STATUS_LINES = 40;
const LOG_DEPTH = 25;

let fsInstance: LightningFS | null = null;

function fileSystem(): LightningFS {
  if (!fsInstance) fsInstance = new LightningFS(FS_NAME);
  return fsInstance;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getCurrentRepo(): string | null {
  try {
    return localStorage.getItem(CURRENT_REPO_KEY) || null;
  } catch {
    return null;
  }
}

export function setCurrentRepo(name: string | null): void {
  try {
    if (name === null) localStorage.removeItem(CURRENT_REPO_KEY);
    else localStorage.setItem(CURRENT_REPO_KEY, name);
  } catch {
    // The selection just does not survive a reload in private sessions.
  }
}

export function repoDir(name: string): string {
  return `${REPOS_ROOT}/${name}`;
}

/** Repositories that live in the app's persistent browser filesystem. */
export async function listRepos(): Promise<string[]> {
  try {
    const entries = await fileSystem().promises.readdir(REPOS_ROOT);
    return entries.filter(Boolean).sort();
  } catch {
    return [];
  }
}

async function repoExists(name: string): Promise<boolean> {
  return (await listRepos()).includes(name);
}

async function flushFilesystem(): Promise<void> {
  try {
    await fileSystem().promises.flush();
  } catch {
    // Flushing is an optimization; not being able to flush is tolerable.
  }
}

async function readConfigPath(dir: string, path: string): Promise<string | undefined> {
  try {
    const value = await getConfig({ fs: fileSystem(), dir, path });
    if (typeof value === 'string' && value) return value;
  } catch {
    // Unset config paths read as undefined.
  }
  return undefined;
}

async function remoteUrl(dir: string): Promise<string | undefined> {
  return readConfigPath(dir, 'remote.origin.url');
}

/** The checked-out branch, or null while the branch has no commit yet. */
async function checkedBranch(dir: string): Promise<string | null> {
  try {
    const name = await currentBranch({ fs: fileSystem(), dir, fullname: false });
    return (name as string | null) ?? null;
  } catch {
    return null;
  }
}

function requireRepo(): { name: string; dir: string } {
  const name = getCurrentRepo();
  if (!name) {
    throw new Error('no current repository. Clone one first:  clone https://github.com/user/repo.git');
  }
  return { name, dir: repoDir(name) };
}

/** Guard used by push only: clone/pull/fetch of public repositories need no token. */
function requireTokenForPush(): void {
  if (getStoredToken()) return;
  throw new Error(
    'no GitHub token configured. Save one in the token panel above, then retry. ' +
      'Cloning and pulling public repositories do not need a token.',
  );
}

export type RunResult = readonly string[];

/**
 * Execute one shell-style git command and return its output lines.
 * All state lives in the persistent browser filesystem, so cloned repositories
 * survive page reloads.
 */
export async function runCommand(input: string): Promise<RunResult> {
  const parsed = parseCommandLine(input.trim());
  // Accept both `clone <url>` and `git clone <url>`.
  const tokens = parsed[0] === 'git' ? parsed.slice(1) : parsed;
  if (parsed.length === 0) return [];
  if (tokens.length === 0) return helpLines();
  const [command, ...args] = tokens;
  try {
    switch (command) {
      case 'help':
        return helpLines();
      case 'clone':
        return await cmdClone(args);
      case 'status':
        return await cmdStatus();
      case 'add':
        return await cmdAdd(args);
      case 'commit':
        return await cmdCommit(args);
      case 'push':
        return await cmdPush();
      case 'pull':
        return await cmdPull();
      case 'fetch':
        return await cmdFetch();
      case 'branch':
        return await cmdBranch(args);
      case 'checkout':
        return await cmdCheckout(args);
      case 'log':
        return await cmdLog();
      case 'remote':
        return await cmdRemote();
      case 'ls':
        return await cmdLs(args);
      case 'pwd': {
        return [requireRepo().dir];
      }
      case 'repos': {
        const repos = await listRepos();
        if (repos.length === 0) return ['No repositories cloned yet.'];
        const current = getCurrentRepo();
        return repos.map((repo) => (repo === current ? `* ${repo}  (current)` : `  ${repo}`));
      }
      case 'use': {
        if (args.length !== 1) return ['usage: use <repository>'];
        if (!(await repoExists(args[0]))) return [`error: there is no repository ${args[0]}; run  repos  to list them.`];
        setCurrentRepo(args[0]);
        return [`now using ${args[0]}`];
      }
      case 'config':
        return await cmdConfig(args);
      case 'auth': {
        if (getStoredToken()) {
          return ['a token is configured. Clone, pull, and push require only that it stays valid.'];
        }
        return ['no token configured. Cloning public repositories works; push does not.'];
      }
      default:
        return [`${command}: unknown command`, 'Type  help  for the available commands.'];
    }
  } catch (error) {
    const code = typeof (error as { code?: unknown } | null)?.code === 'string'
      ? (error as { code: string }).code
      : null;
    return code ? [`error: ${errorMessage(error)}`, `(${code})`] : [`error: ${errorMessage(error)}`];
  }
}

/* -------------------------------------------------------------------------- */
/* clone                                                                       */
/* -------------------------------------------------------------------------- */

async function cmdClone(args: string[]): Promise<string[]> {
  const url = args[0];
  if (!url) return ['usage: clone <https://github.com/user/repo.git>'];
  const taken = new Set(await listRepos());
  let name: string;
  try {
    name = repoNameFromUrl(url);
  } catch (error) {
    return [errorMessage(error)];
  }
  if (name.length > 0 && taken.has(name)) {
    let suffix = 2;
    while (taken.has(`${name}-${suffix}`)) suffix += 1;
    name = `${name}-${suffix}`;
  }
  const dir = repoDir(name);
  try {
    // Shallow, single-branch clone: full history of large repos can exhaust browser memory.
    await clone({
      fs: fileSystem(),
      http,
      dir,
      url,
      corsProxy: CORS_PROXY,
      onAuth: onAuthCallback(),
      depth: 1,
      singleBranch: true,
    });
    await flushFilesystem();
    setCurrentRepo(name);
    const branchName = await checkedBranch(dir);
    return [
      `cloned ${url}`,
      `into   ${dir}`,
      `branch ${branchName ?? '(none)'}`,
      'this is now the current repository.',
    ];
  } catch (error) {
    try {
      await fileSystem().promises.rmdir(dir);
    } catch {
      // Best-effort cleanup; the partial clone stays otherwise.
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* status                                                                      */
/* -------------------------------------------------------------------------- */

/** One row of git.statusMatrix: [path, head, workdir, index]. */
type MatrixRow = [string, number, number, number];

interface StatusSummary {
  readonly staged: string[];
  readonly modified: string[];
  readonly deleted: string[];
  readonly untracked: string[];
}

function classifyMatrix(matrix: readonly MatrixRow[]): StatusSummary {
  const staged: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  const untracked: string[] = [];
  for (const [path, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) continue;
    if (stage === 0 && head === 0 && workdir !== 0) {
      untracked.push(path);
      continue;
    }
    if (stage !== head && head !== 0) staged.push(path);
    if (workdir === 0 && head === 1 && stage <= 1) deleted.push(path);
    if (workdir !== 0 && stage <= 1 && stage === head) modified.push(path);
  }
  return { staged, modified, deleted, untracked };
}

function statusLines(summary: StatusSummary, detail: boolean): string[] {
  const lines: string[] = [];
  for (const [label, paths] of [['staged', summary.staged], ['modified', summary.modified], ['deleted', summary.deleted], ['untracked', summary.untracked]] as const) {
    if (paths.length === 0) continue;
    lines.push(`${label}: ${paths.length}`);
    if (!detail) continue;
    for (const path of paths.slice(0, MAX_STATUS_LINES)) lines.push(`  ${path}`);
    if (paths.length > MAX_STATUS_LINES) lines.push(`  ... and ${paths.length - MAX_STATUS_LINES} more`);
  }
  if (lines.length === 0) lines.push('working tree clean.');
  return lines;
}

async function cmdStatus(): Promise<string[]> {
  const { dir } = requireRepo();
  const matrix = (await statusMatrix({ fs: fileSystem(), dir })) as MatrixRow[];
  const branchName = await checkedBranch(dir);
  const origin = await remoteUrl(dir);
  return [
    `branch ${branchName ?? '(no branch committed yet)'}`,
    `remote ${origin ? origin.replace('//', '//***@') : '(none)'}`,
    ...statusLines(classifyMatrix(matrix), true),
  ];
}

/* -------------------------------------------------------------------------- */
/* add / commit / push / pull / fetch                                          */
/* -------------------------------------------------------------------------- */

async function cmdAdd(args: string[]): Promise<string[]> {
  const { dir } = requireRepo();
  if (args.length === 0) return ['usage: add -A  |  add <path> ...'];
  const all = args.some((arg) => arg === '-A' || arg === '--all' || arg === '.');
  if (all) {
    const matrix = (await statusMatrix({ fs: fileSystem(), dir })) as MatrixRow[];
    const changed = matrix.filter(([, , workdir, stage]) => workdir !== stage);
    let count = 0;
    for (const [path, , workdir] of changed) {
      if (workdir !== 0) {
        await add({ fs: fileSystem(), dir, filepath: path });
      } else {
        try {
          await updateIndex({ fs: fileSystem(), dir, filepath: path, remove: true });
        } catch {
          // Removing a never-staged deletion from the index is a no-op at worst.
        }
      }
      count += 1;
    }
    await flushFilesystem();
    return [`staged ${count} path(s).`];
  }
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (paths.length === 0) return ['nothing to stage.'];
  for (const path of paths) {
    await add({ fs: fileSystem(), dir, filepath: path });
  }
  await flushFilesystem();
  return [`staged ${paths.length} path(s).`];
}

async function cmdCommit(args: string[]): Promise<string[]> {
  const { dir } = requireRepo();
  const messageIndex = args.indexOf('-m');
  const message = messageIndex >= 0 ? args.slice(messageIndex + 1).join(' ') : '';
  if (!message) return ['usage: commit -m <message>', 'stage first with  add -A  or  add <path>.'];
  const [name, email] = await Promise.all([
    readConfigPath(dir, 'user.name'),
    readConfigPath(dir, 'user.email'),
  ]);
  if (!name || !email) {
    return [
      'error: commits need an author. set the identity once per repository:',
      '  config user.name "Your Name"',
      '  config user.email you@example.com',
    ];
  }
  const sha = await commit({ fs: fileSystem(), dir, message, author: { name, email } });
  await flushFilesystem();
  return [`committed ${shortSha(sha)} ${message.split('\n')[0] ?? ''}`.trimEnd()];
}

async function cmdPush(): Promise<string[]> {
  const { dir, name } = requireRepo();
  requireTokenForPush();
  const branchName = await checkedBranch(dir);
  if (!branchName) throw new Error(`nothing checked out in /repos/${name}`);
  const origin = await remoteUrl(dir);
  if (!origin) return [`error: /repos/${name} has no remote. only cloned repositories can push.`];
  const result = await push({
    fs: fileSystem(),
    http,
    dir,
    ref: branchName,
    remoteRef: branchName,
    corsProxy: CORS_PROXY,
    onAuth: onAuthCallback(),
  });
  const rejected = result.ok === false ? result.error : null;
  if (rejected) throw new Error(`push rejected by the remote: ${rejected}`);
  await flushFilesystem();
  return [`pushed ${branchName} to ${origin}`];
}

async function cmdPull(): Promise<string[]> {
  const { dir, name } = requireRepo();
  const origin = await remoteUrl(dir);
  if (!origin) return [`error: /repos/${name} has no remote. only cloned repositories can pull.`];
  await pull({
    fs: fileSystem(),
    http,
    dir,
    corsProxy: CORS_PROXY,
    onAuth: onAuthCallback(),
    fastForwardOnly: true,
  });
  await flushFilesystem();
  return [`pulled from ${origin}. local branch is up to date.`];
}

async function cmdFetch(): Promise<string[]> {
  const { dir, name } = requireRepo();
  const origin = await remoteUrl(dir);
  if (!origin) return [`error: /repos/${name} has no remote.`];
  const result = await fetch({ fs: fileSystem(), http, dir, corsProxy: CORS_PROXY, onAuth: onAuthCallback() });
  await flushFilesystem();
  return [
    `fetched from ${origin}.`,
    result.fetchHead ? `remote head ${result.fetchHead.slice(0, 8)}` : 'remote branch had no commits.',
  ];
}

/* -------------------------------------------------------------------------- */
/* branch / checkout / log / remote / ls / config                              */
/* -------------------------------------------------------------------------- */

async function cmdBranch(args: string[]): Promise<string[]> {
  const { dir } = requireRepo();
  if (args.some((arg) => arg === '-r' || arg === '--remote')) {
    const remote = await listBranches({ fs: fileSystem(), dir, remote: 'origin' });
    if (remote.length === 0) return ['no remote branches in the local tracking refs. run  fetch  first.'];
    return remote.map((name) => `  origin/${name}`);
  }
  const names = args.filter((arg) => !arg.startsWith('-'));
  if (names.length === 0) {
    const local = await listBranches({ fs: fileSystem(), dir });
    if (local.length === 0) return ['no branches yet; the repository is unborn.'];
    const current = await checkedBranch(dir);
    return local.map((name) => (name === current ? `* ${name}` : `  ${name}`));
  }
  if (names.length === 1) {
    await branch({ fs: fileSystem(), dir, ref: names[0] });
    await flushFilesystem();
    return [`created branch ${names[0]}`];
  }
  return ['usage: branch  |  branch -r  |  branch <name>  |  branch -d <name>'];
}

async function cmdCheckout(args: string[]): Promise<string[]> {
  const { dir } = requireRepo();
  if (args.length !== 1) return ['usage: checkout <branch>'];
  const ref = args[0].replace(/^origin\//, '');
  try {
    await checkout({ fs: fileSystem(), dir, ref });
  } catch (error) {
    // Remote branch the user has not checked out locally yet: create it first.
    const message = errorMessage(error).toLowerCase();
    if (/unborn|no branch|not( a| an?) (local )?branch|couldn'?t? find/.test(message)) {
      await branch({ fs: fileSystem(), dir, ref });
      await checkout({ fs: fileSystem(), dir, ref });
    } else {
      throw error;
    }
  }
  await flushFilesystem();
  return [`now on branch ${ref}`];
}

async function cmdLog(): Promise<string[]> {
  const { dir } = requireRepo();
  try {
    const entries = await log({ fs: fileSystem(), dir, depth: LOG_DEPTH });
    if (entries.length === 0) return ['no commits yet.'];
    return entries.map((entry) => {
      const when = new Date(entry.commit.author.timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
      return `${shortSha(entry.oid)} ${entry.commit.message.split('\n')[0] ?? ''}  (${entry.commit.author.name}, ${when})`;
    });
  } catch (error) {
    const message = errorMessage(error).toLowerCase();
    if (/unborn|no commits|could not find/.test(message)) return ['no commits yet.'];
    throw error;
  }
}

async function cmdRemote(): Promise<string[]> {
  const { dir } = requireRepo();
  const origin = await remoteUrl(dir);
  if (!origin) return ['no remote configured.'];
  return [`origin ${origin}`];
}

async function cmdLs(args: string[]): Promise<string[]> {
  const { dir } = requireRepo();
  const relative = args.filter((arg) => !arg.startsWith('-'))[0] ?? '';
  const target = relative ? `${dir}/${relative.replace(/^\/+|\/+$/g, '')}` : dir;
  const entries: string[] = await fileSystem().promises.readdir(target);
  if (entries.length === 0) return ['(empty)'];
  const decorated = await Promise.all(
    entries.slice(0, 200).map(async (entry) => {
      try {
        const stat = await fileSystem().promises.stat(`${target}/${entry}`);
        return stat.isDirectory() ? `${entry}/` : entry;
      } catch {
        return entry;
      }
    }),
  );
  return [...decorated.sort()];
}

async function cmdConfig(args: string[]): Promise<RunResult> {
  const { dir, name } = requireRepo();
  if (args.length === 0) {
    const [configuredName, configuredEmail, origin] = await Promise.all([
      readConfigPath(dir, 'user.name'),
      readConfigPath(dir, 'user.email'),
      remoteUrl(dir),
    ]);
    return [
      `user.name  ${configuredName ?? '(not set)'}`,
      `user.email ${configuredEmail ?? '(not set)'}`,
      `remote     ${origin ?? '(none)'}`,
      `repository ${repoDir(name)}`,
      'set them with:',
      '  config user.name YourName',
      '  config user.email you@example.com',
    ];
  }
  if (args[0] === 'user.name') {
    if (args.length < 2) return ['usage: config user.name <value>'];
    const value = args.slice(1).join(' ');
    await setConfig({ fs: fileSystem(), dir, path: 'user.name', value });
    await flushFilesystem();
    return [`user.name set to ${value}`];
  }
  if (args[0] === 'user.email') {
    if (args.length !== 2) return ['usage: config user.email <value>'];
    await setConfig({ fs: fileSystem(), dir, path: 'user.email', value: args[1] });
    await flushFilesystem();
    return [`user.email set to ${args[1]}`];
  }
  return [
    'usage: config  |  config user.name <name>  |  config user.email <value>',
    'only user.name and user.email are configurable here.',
  ];
}
