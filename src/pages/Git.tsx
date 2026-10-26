import { BrickWall, Download, FileDown, GitBranch, Lock, LockOpen, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { hasStoredToken, maskedToken, setStoredCredentials } from '../lib/git/auth';
import { CORS_PROXY, getCurrentRepo, listRepos, readRepoFiles, runCommand, setCurrentRepo } from '../lib/git/service';
import { Badge, Button, Card, PageHeader } from '../components/ui';
import { classNames, plural } from '../lib/format';
import { importFiles } from '../core/importer';
import { useApp } from '../state/AppStore';

const HISTORY_KEY = 'openbor-stats-git-history';

const WELCOME: readonly string[] = [
  'OpenBOR Workbench git terminal. Repositories are stored in this browser; nothing is uploaded.',
  'clone https://github.com/you/your-mod.git starts a project, and  help  lists everything.',
  `Network traffic goes through the public CORS proxy ${CORS_PROXY} because git hosts do not send CORS headers.`,
];

interface HistoryEntry {
  id: number;
  kind: 'command' | 'output' | 'error';
  text: string;
}

function loadPastCommands(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(-60) : [];
  } catch {
    return [];
  }
}

function savePastCommands(commands: string[]): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(commands.slice(-60)));
  } catch {
    // Session storage may be unavailable; history just does not persist.
  }
}

export function Git() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [repos, setRepos] = useState<string[]>([]);
  const [currentRepo, setCurrentRepoState] = useState<string | null>(getCurrentRepo());
  const [tokenInput, setTokenInput] = useState('');
  const [tokenState, setTokenState] = useState<string | null>(() => maskedToken());
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [cloneUrl, setCloneUrl] = useState('');
  const { createProject, notify } = useApp();
  const pastCommands = useRef<string[]>(loadPastCommands());
  const outputRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const pushEntries = (newEntries: { kind: HistoryEntry['kind']; text: string }[]) => {
    setEntries((existing) => {
      const trimmed = existing.length > 600 ? existing.slice(-400) : existing;
      return [...trimmed, ...newEntries.map((entry) => ({ ...entry, id: nextId.current++ }))];
    });
  };

  useEffect(() => {
    void refreshRepos();
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [entries, busy]);

  const refreshRepos = async () => {
    setRepos(await listRepos());
    setCurrentRepoState(getCurrentRepo());
  };

  /** Turn a freshly cloned repository into a project so it appears on the Projects tab. */
  const addClonedProject = async (url: string) => {
    const name = getCurrentRepo();
    if (!name) return;
    try {
      const imported = importFiles(await readRepoFiles(name));
      if (imported.entities.length === 0) {
        notify(`${name} was cloned, but it has no OpenBOR model or level files to add as a project.`, 'error');
        return;
      }
      await createProject(name, `Cloned from ${url}`, imported);
    } catch (error) {
      notify(`${name} was cloned, but it could not be added as a project: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const execute = async (raw: string) => {
    const command = raw.trim();
    if (!command || busy) return;
    if (command === 'clear') {
      setEntries([]);
      return;
    }
    setBusy(true);
    pushEntries([{ kind: 'command', text: `$ ${command}` }]);
    try {
      const result = await runCommand(command);
      pushEntries(
        result.map((line) => ({ kind: line.startsWith('error:') ? ('error' as const) : ('output' as const), text: line })),
      );
      await refreshRepos();
      if (/^(git\s+)?clone\s/.test(command) && result[0]?.startsWith('cloned ')) {
        await addClonedProject(command.replace(/^(git\s+)?clone\s+/, '').trim());
      }
    } catch (error) {
      pushEntries([
        { kind: 'error', text: `error: ${error instanceof Error ? error.message : String(error)}` },
      ]);
    } finally {
      if (command !== 'help') {
        pastCommands.current = [...pastCommands.current.filter((existing) => existing !== command), command];
        savePastCommands(pastCommands.current);
      }
      setHistoryIndex(null);
      setBusy(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void execute(input);
      setInput('');
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const commands = pastCommands.current;
    if (commands.length === 0) return;
    let index = historyIndex === null ? commands.length : historyIndex;
    if (event.key === 'ArrowUp') index = Math.max(0, index - 1);
    else index = Math.min(commands.length, index + 1);
    if (index >= commands.length) {
      setHistoryIndex(null);
      setInput('');
      return;
    }
    setHistoryIndex(index);
    setInput(commands[index] ?? '');
  };

  const startClone = async () => {
    const url = (cloneUrl ?? '').trim();
    if (!url || busy) return;
    setCloneUrl('');
    await execute(`clone ${url}`);
  };

  const saveToken = () => {
    const value = tokenInput.trim();
    if (!value) return;
    setStoredCredentials(null, value);
    setTokenInput('');
    setTokenState(maskedToken());
    pushEntries([{ kind: 'output', text: 'token saved in this browser. push is available while the server accepts it.' }]);
  };

  const clearToken = () => {
    setStoredCredentials(null, null);
    setTokenState(null);
    pushEntries([{ kind: 'output', text: 'token removed from this browser.' }]);
  };

  const switchRepo = (value: string) => {
    setCurrentRepo(value || null);
    setCurrentRepoState(value || null);
    pushEntries([{ kind: 'output', text: value ? `now using /repos/${value}` : 'no repository selected.' }]);
  };

  const quickActions = [
    { label: 'status', fill: 'status', icon: FileDown },
    { label: 'stage all', fill: 'add -A', icon: Download },
    { label: 'pull', fill: 'pull', icon: RefreshCw },
    { label: 'push', fill: 'push', icon: Upload },
    { label: 'log', fill: 'log', icon: GitBranch },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Git terminal"
        subtitle="Clone from GitHub, then pull, commit, and push, all from this browser. Repositories persist in IndexedDB; nothing is installed."
      />

      <div className="grid grid-main" style={{ marginBottom: 16 }}>
        <Card>
          <div className="card-head">
            <div>
              <h3>Token for push access</h3>
              <div className="sub">Required only for push; public clones and pulls work without one.</div>
            </div>
            <Badge tone={hasStoredToken() ? 'success' : 'warning'}>
              {hasStoredToken() ? 'Token saved' : 'No token'}
            </Badge>
          </div>
          <div className="card-body col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 200 }}
                type="password"
                placeholder="ghp_ or fine-grained token"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                aria-label="GitHub personal access token"
              />
              <Button variant="primary" icon={Lock} onClick={saveToken}>
                Save
              </Button>
              <Button variant="danger" icon={Trash2} onClick={clearToken} disabled={!tokenState}>
                Remove
              </Button>
            </div>
            <div className="small muted">
              {tokenState ? (
                <span className="row" style={{ gap: 5 }}>
                  <LockOpen size={13} /> Saved <span className="mono">{tokenState}</span> locally.{' '}
                  {getCurrentRepo() ? '' : 'Clone a repository before pushing.'}
                </span>
              ) : null}
              The token stays in this browser and is sent only to github.com (and GitLab/Bitbucket). Because
              git hosts do not send CORS headers, requests relay through the public proxy{' '}
              <span className="mono">{CORS_PROXY}</span>, which sees the request. Use a fine-grained token and
              revoke it when done.
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <div>
              <h3>Repos {plural(repos.length, 'repository')}</h3>
              <div className="sub">Persisted in this browser and reusable any time.</div>
            </div>
            <Button size="sm" icon={RefreshCw} onClick={() => void refreshRepos()}>
              Refresh
            </Button>
          </div>
          <div className="card-body col" style={{ gap: 10 }}>
            <select
              className="select"
              value={currentRepo ?? ''}
              onChange={(event) => switchRepo(event.target.value)}
              aria-label="Current repository"
            >
              <option value="">No repository selected</option>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  /repos/{repo}
                </option>
              ))}
            </select>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 200 }}
                placeholder="https://github.com/user/repo.git"
                value={cloneUrl}
                onChange={(event) => setCloneUrl(event.target.value)}
                aria-label="Repository URL"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void startClone();
                }}
              />
              <Button variant="primary" icon={BrickWall} onClick={() => void startClone()} disabled={!cloneUrl.trim() || busy}>
                Clone
              </Button>
            </div>
            <div className="small muted">Cloning is done with  clone &lt;url&gt;  in the terminal or here.</div>
          </div>
        </Card>
      </div>

      <div className="terminal-card card" style={{ padding: 0 }}>
        <div className="card-head" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <div className="row" style={{ gap: 6 }}>
            <GitBranch size={14} className="muted" />
            <strong style={{ fontSize: 13 }}>workbench:/{currentRepo ? `repos/${currentRepo}` : 'repos'}$</strong>
          </div>
          <div className="row" style={{ gap: 4 }}>
            {quickActions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant="ghost"
                icon={action.icon}
                onClick={() => void execute(action.fill)}
                disabled={busy}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
        <div
          ref={outputRef}
          className="terminal-output mono"
          style={{ height: 360, overflowY: 'auto', fontSize: 12, lineHeight: 1.55, padding: '10px 14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          aria-live="polite"
          aria-label="Terminal output"
        >
          {WELCOME.map((line, index) => (
            <div key={`welcome-${index}`} className="muted">{line}</div>
          ))}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={classNames(
                entry.kind === 'command' ? 'text-accent' : entry.kind === 'error' ? 'text-danger' : '',
              )}
            >
              {entry.text}
            </div>
          ))}
          {busy ? <div className="muted">working…</div> : null}
        </div>
        <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', padding: '8px 14px 10px' }}>
          <span className="mono" style={{ color: 'var(--accent)', paddingTop: 6 }}>
            {currentRepo ? `/repos/${currentRepo}` : 'repos'}$
          </span>
          <input
            className="input terminal-input"
            style={{ flex: 1, background: 'transparent', border: 'none', boxShadow: 'none', paddingLeft: 0, fontFamily: 'inherit' }}
            placeholder={busy ? 'working…' : 'clone, status, add -A, commit -m "message", push, pull …'}
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Git command"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </>
  );
}
