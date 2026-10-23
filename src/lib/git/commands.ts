/**
 * Pure helpers for the Git terminal. No filesystem or network access here so these
 * functions are easy to test.
 */

/** Error thrown when a command line or URL cannot be interpreted at all. */
export class CommandParseError extends Error {}

/**
 * Tokenize a command line the way a shell would: split on whitespace, and treat
 * single- or double-quoted spans as one token. Escapes are not supported; the
 * terminal is for git commands with simple arguments like -m "message".
 */
export function parseCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let insideToken = false;
  let quote: '"' | "'" | null = null;

  const flush = () => {
    if (insideToken) {
      tokens.push(current);
      current = '';
      insideToken = false;
    }
  };

  for (const ch of input) {
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      insideToken = true;
    } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      flush();
    } else {
      current += ch;
      insideToken = true;
    }
  }
  flush();
  return tokens;
}

function sanitizeRepoName(value: string, url: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-');
  if (!cleaned) {
    throw new CommandParseError(`could not infer a repository name from "${url}"`);
  }
  return cleaned;
}

/**
 * Derive a directory name from a repository URL, e.g.
 * https://github.com/owner/OpenBOR-Workbench.git       -> owner-OpenBOR-Workbench
 * git@github.com:owner/OpenBOR-Workbench.git           -> owner-OpenBOR-Workbench
 * https://gitlab.com/owner/subgroup/project.git        -> project
 */
export function repoNameFromUrl(url: string): string {
  let normalized = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  if (normalized.startsWith('git@')) {
    normalized = normalized.replace(/^git@[^:]*:/, '');
  }
  const segments = normalized.split(/[:/]/).filter(Boolean);
  // A remote always has an owner and a repository (owner/repo). If stripping the
  // URL leaves fewer segments, there is no usable repository name.
  if (segments.length < 2) {
    throw new CommandParseError(`could not infer a repository name from "${url}"`);
  }
  return sanitizeRepoName(segments[segments.length - 1], url);
}

const HELP_LINES: readonly string[] = [
  'Available commands:',
  '  clone <url>          Clone a GitHub (or any HTTPS git) repository.',
  '  status               Show staged, modified, and untracked files.',
  '  add <path> ...       Stage changed files;  add -A  stages everything.',
  '  commit -m <message>  Commit all staged changes. Requires user.name and user.email.',
  '  push                 Push the current branch to its remote. Needs a token.',
  '  pull                 Fetch and merge the remote branch. Needs a token if private.',
  '  fetch                Download remote objects without merging.',
  '  branch               List local branches.  branch -r  lists remote branches.',
  '  checkout <name>      Switch to a local branch, or create one from its remote branch.',
  '  log                  Show the last 25 commits.',
  '  remote               Print the URL the repository was cloned from.',
  '  ls [path]            List files in the repository directory.',
  '  pwd                  Print the current repository path.',
  '  repos                List cloned repositories; the current one is marked.',
  '  use <repo>           Make another cloned repository current.',
  '  config               Print user.name, user.email, and the remote URL.',
  '  config user.name X   Set the name commits are authored with.',
  '  config user.email X  Set the email commits are authored with.',
  '  auth                 Show whether a GitHub token is configured.',
  '  clear                Clear the terminal output.',
  '  help                 Show this help.',
  '',
  'Notes: the working directory is the repository root; paths like  ls data/chars  are',
  'relative to it. A GitHub token can be set from the panel above; without one, cloning',
  'public repositories works, but push does not.',
];

export function helpLines(): readonly string[] {
  return HELP_LINES;
}

/** Short display for a commit SHA. */
export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}
