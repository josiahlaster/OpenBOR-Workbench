import {
  AlertTriangle,
  Download,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Modal,
  PageHeader,
} from '../components/ui';
import { downloadJson, formatDate, formatNumber } from '../lib/format';
import { useApp, DEFAULT_SETTINGS } from '../state/AppStore';

type Theme = 'dark' | 'light' | 'system';

export function Settings() {
  const {
    projects,
    activeProject,
    drafts,
    settings,
    updateSettings,
    exportBackupFile,
    importBackupText,
    clearAllData,
    persistenceError,
    notify,
  } = useApp();
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [pendingBackup, setPendingBackup] = useState<{ name: string; text: string } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    void navigator.storage.estimate().then((estimate) => {
      setStorageInfo({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
    });
  }, [projects, drafts]);

  const exportBackup = () => {
    const backup = exportBackupFile();
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`openbor-stats-backup-${date}.json`, backup);
    notify(`Backup exported with ${backup.projects.length} project(s).`, 'success');
  };

  const importBackup = async (mode: 'merge' | 'replace') => {
    if (!pendingBackup) return;
    try {
      await importBackupText(pendingBackup.text, mode);
      setPendingBackup(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import the backup.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Settings"
        subtitle="Appearance, editor behaviour, and the local data stored on this device. There is no server-side account or sync."
      />

      <div className="grid-main">
        <div className="col" style={{ gap: 14 }}>
          <Card>
            <div className="card-head">
              <div>
                <h3>Appearance</h3>
                <div className="sub">Theme is applied immediately and stored locally</div>
              </div>
            </div>
            <div className="card-body">
              <div className="theme-options">
                {([
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'light', label: 'Light', icon: Sun },
                  { id: 'system', label: 'System', icon: Monitor },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`theme-option${settings.theme === option.id ? ' active' : ''}`}
                    onClick={() => void updateSettings({ theme: option.id as Theme })}
                    aria-pressed={settings.theme === option.id}
                  >
                    <span className={`theme-preview ${option.id}`} aria-hidden="true">
                      <span />
                      <span />
                    </span>
                    <span className="row" style={{ gap: 6, fontSize: 12 }}>
                      <option.icon size={13} />
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-head">
              <div>
                <h3>Editor</h3>
                <div className="sub">Preferences for this browser</div>
              </div>
            </div>
            <div className="card-body">
              <div className="settings-row">
                <div>
                  <strong>Autosave drafts</strong>
                  <span>Save unsaved editor text to IndexedDB after a short delay so a reload does not lose work.</span>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={settings.autosaveDrafts}
                    onChange={(event) => void updateSettings({ autosaveDrafts: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <div className="settings-row">
                <div>
                  <strong>Editor font size</strong>
                  <span>Applies to raw model text and models.txt. The editor uses a monospace font.</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    type="range"
                    min={11}
                    max={18}
                    step={1}
                    value={settings.editorFontSize}
                    onChange={(event) => void updateSettings({ editorFontSize: Number(event.target.value) })}
                    aria-label="Editor font size"
                  />
                  <span className="mono small" style={{ width: 32 }}>{settings.editorFontSize}px</span>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <strong>Keyboard shortcuts</strong>
                  <span>Ctrl+S saves, Ctrl+Z undoes outside text inputs, Ctrl+Shift+Z redoes.</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={() => void updateSettings(DEFAULT_SETTINGS)}
                >
                  Reset preferences
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-head">
              <div>
                <h3>Backup and restore</h3>
                <div className="sub">Project bundles and model .txt files remain the portable source of truth</div>
              </div>
            </div>
            <div className="card-body col" style={{ gap: 10 }}>
              <div className="row wrap">
                <Button variant="primary" icon={Download} onClick={exportBackup}>
                  Export all projects
                </Button>
                <Button icon={Upload} onClick={() => backupInput.current?.click()}>
                  Import backup
                </Button>
                <input
                  ref={backupInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      setPendingBackup({ name: file.name, text: await file.text() });
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Could not read this backup.', 'error');
                    }
                    event.target.value = '';
                  }}
                />
              </div>
              <div className="small muted">
                Backups include project text, summaries, revisions, asset path indexes, and settings. They do not
                include image or audio files. Use project export in Projects for a single-project bundle.
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-head">
              <div>
                <h3>Local data</h3>
                <div className="sub">Everything in this section lives in this browser profile</div>
              </div>
              <Badge tone={persistenceError ? 'error' : 'success'}>
                {persistenceError ? 'Storage issue' : 'IndexedDB active'}
              </Badge>
            </div>
            <div className="card-body col" style={{ gap: 10 }}>
              {persistenceError ? (
                <div className="alert-banner" style={{ marginBottom: 0 }}>
                  <AlertTriangle size={14} />
                  {persistenceError}
                </div>
              ) : null}
              <div className="row-between small">
                <span className="muted">Projects</span>
                <span className="mono">{projects.length}</span>
              </div>
              <div className="row-between small">
                <span className="muted">Entities</span>
                <span className="mono">{projects.reduce((sum, project) => sum + project.entities.length, 0)}</span>
              </div>
              <div className="row-between small">
                <span className="muted">Unsaved drafts</span>
                <span className="mono">{Object.keys(drafts).length}</span>
              </div>
              <div className="row-between small">
                <span className="muted">Active project</span>
                <span>{activeProject?.name ?? 'None'}</span>
              </div>
              {storageInfo ? (
                <div className="row-between small">
                  <span className="muted">Browser storage used</span>
                  <span className="mono">
                    {formatBytes(storageInfo.usage)} of {formatBytes(storageInfo.quota)}
                  </span>
                </div>
              ) : null}
              <div className="divider" />
              <div className="row wrap">
                <Button variant="danger" icon={Trash2} onClick={() => setClearOpen(true)}>
                  Clear all local data
                </Button>
              </div>
              <div className="small muted">
                Clearing local data removes all projects, drafts, and settings from this browser. Export a
                backup first if you need to keep them.
              </div>
            </div>
          </Card>
        </div>

        <div className="col" style={{ gap: 14 }}>
          <Card>
            <div className="card-head">
              <h3>At a glance</h3>
            </div>
            <div className="card-body col" style={{ gap: 8 }}>
              <div className="row-between small"><span className="muted">Projects</span><span className="mono">{projects.length}</span></div>
              <div className="row-between small"><span className="muted">Entities</span><span className="mono">{formatNumber(projects.reduce((sum, project) => sum + project.entities.length, 0))}</span></div>
              <div className="row-between small"><span className="muted">Drafts</span><span className="mono">{Object.keys(drafts).length}</span></div>
              <div className="row-between small">
                <span className="muted">Last project update</span>
                <span className="mono">
                  {projects.length ? formatDate(Math.max(...projects.map((project) => project.updatedAt))) : '—'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={pendingBackup !== null}
        onClose={() => setPendingBackup(null)}
        title="Import backup"
        subtitle={pendingBackup?.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingBackup(null)}>Cancel</Button>
            <Button onClick={() => void importBackup('merge')}>Merge projects</Button>
            <Button variant="danger" onClick={() => void importBackup('replace')}>Replace all</Button>
          </>
        }
      >
        <p className="small muted">
          <strong>Merge</strong> keeps current projects and adds the backup's projects, renaming duplicates.
          <strong> Replace all</strong> removes the current projects and settings before importing the backup.
        </p>
        <div className="small muted">
          {pendingBackup ? `${(pendingBackup.text.length / 1024).toFixed(1)} KB · ${pendingBackup.name}` : ''}
        </div>
      </Modal>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void clearAllData()}
        title="Clear all local data?"
        description="Every project, entity, revision, draft, and setting stored by OpenBOR Stats in this browser will be deleted. This cannot be undone. Downloaded .txt files and backups on disk are not affected."
        confirmLabel="Delete all local data"
        danger
      />
    </>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
