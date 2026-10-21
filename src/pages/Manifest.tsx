import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileCode2,
  RefreshCw,
  Save,
  Upload,
  Wand2,
} from 'lucide-react';
import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from '../components/ui';
import {
  findMissingManifestEntities,
  generateModelsManifest,
  parseModelsManifest,
} from '../core/modelsManifest';
import type { Project } from '../core/types';
import { downloadText } from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../state/AppStore';

export function Manifest() {
  const { activeProject, saveModelsFile, notify } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  if (!activeProject) {
    return (
      <>
        <PageHeader eyebrow="Workspace" title="models.txt" subtitle="Register OpenBOR models so the engine can load them." />
        <EmptyState
          icon={Database}
          title="No active project"
          description="Select a project to inspect or generate its models.txt manifest."
          actions={<Button onClick={() => navigate('projects')}>Open projects</Button>}
        />
      </>
    );
  }
  return (
    <ManifestEditor
      key={activeProject.id}
      project={activeProject}
      saveModelsFile={saveModelsFile}
      fileInput={fileInput}
      notify={notify}
    />
  );
}

function ManifestEditor({
  project,
  saveModelsFile,
  fileInput,
  notify,
}: {
  project: Project;
  saveModelsFile: (projectId: string, raw: string) => Promise<void>;
  fileInput: RefObject<HTMLInputElement | null>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}) {
  const [buffer, setBuffer] = useState(project.modelsFile ?? '');
  const [saving, setSaving] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const saved = project.modelsFile ?? '';
  const dirty = buffer !== saved;
  const parsed = useMemo(() => parseModelsManifest(buffer), [buffer]);
  const missing = useMemo(
    () => (buffer ? findMissingManifestEntities(parsed, project.entities) : []),
    [buffer, parsed, project.entities],
  );
  const registeredNames = new Set(parsed.entries.map((entry) => entry.name.toLowerCase()));
  const unregistered = project.entities.filter(
    (entity) => !registeredNames.has((entity.summary.name ?? '').toLowerCase()),
  );

  const save = async () => {
    setSaving(true);
    try {
      await saveModelsFile(project.id, buffer);
    } finally {
      setSaving(false);
    }
  };

  const generate = () => {
    setBuffer(generateModelsManifest(project.entities, buffer || project.modelsFile));
    setShowGenerated(true);
  };

  const importManifestFile = async (file: File) => {
    try {
      const text = await file.text();
      setBuffer(text.replace(/^\uFEFF/, ''));
      notify('models.txt loaded into the editor. Save to apply it.', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read models.txt.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="models.txt"
        subtitle="The manifest that registers models with OpenBOR. Paths are relative to the OpenBOR data directory. Save writes the manifest to this project; export it with your game data."
        actions={
          <>
            <Button icon={RefreshCw} onClick={generate} disabled={project.entities.length === 0}>
              Generate from entities
            </Button>
            <Button icon={Upload} onClick={() => fileInput.current?.click()}>
              Load file
            </Button>
            <Button icon={Download} onClick={() => downloadText(project.modelsFileName || 'models.txt', buffer)}>
              Download
            </Button>
            <Button variant="primary" icon={Save} onClick={() => void save()} disabled={!dirty || saving} loading={saving}>
              Save manifest
            </Button>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importManifestFile(file);
          event.target.value = '';
        }}
      />

      <div className="grid grid-3 stats-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-label"><Database /> Load entries</div>
          <div className="stat-value">{parsed.entries.length}</div>
          <div className="stat-foot">{parsed.otherLines} other non-empty lines preserved</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><AlertTriangle /> Missing references</div>
          <div className={missing.length ? 'stat-value danger' : 'stat-value'}>{missing.length}</div>
          <div className="stat-foot">Entries that do not match an imported entity</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><FileCode2 /> Unregistered entities</div>
          <div className="stat-value">{unregistered.length}</div>
          <div className="stat-foot">{project.entities.length} entities in this project</div>
        </div>
      </div>

      <div className="grid-main">
        <Card>
          <div className="card-head">
            <div>
              <h3>Manifest text</h3>
              <div className="sub">
                {project.modelsFileName} · {buffer.split(/\r\n|\n|\r/).length} lines
              </div>
            </div>
            <Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unsaved' : 'Saved'}</Badge>
          </div>
          <div className="card-body">
            <textarea
              className="raw-textarea"
              style={{ minHeight: 440 }}
              value={buffer}
              onChange={(event) => setBuffer(event.target.value)}
              placeholder={'# models.txt\nload player data/chars/player/player.txt'}
              spellCheck={false}
              aria-label="models.txt content"
            />
            <div className="row-between small muted" style={{ marginTop: 8 }}>
              <span>load &lt;model name&gt; &lt;path relative to data/&gt;</span>
              <span>{dirty ? 'Save to keep this manifest in the project.' : 'All changes saved.'}</span>
            </div>
          </div>
        </Card>
        <div className="col" style={{ gap: 14 }}>
          <Card>
            <div className="card-head">
              <h3>Registration status</h3>
            </div>
            <div className="card-body col" style={{ gap: 7 }}>
              {project.entities.length === 0 ? (
                <div className="small muted">Import model files first.</div>
              ) : (
                project.entities.map((entity) => {
                  const name = (entity.summary.name ?? '').toLowerCase();
                  const entry = parsed.entries.find((candidate) => candidate.name.toLowerCase() === name);
                  return (
                    <div className="row-between small" key={entity.id}>
                      <span className="truncate" style={{ maxWidth: 180 }}>{entity.summary.name ?? entity.fileName}</span>
                      {entry ? (
                        <Badge tone={findMissingManifestEntities({ ...parsed, entries: [entry] }, [entity]).length ? 'warning' : 'success'}>
                          {findMissingManifestEntities({ ...parsed, entries: [entry] }, [entity]).length ? 'Path differs' : 'Registered'}
                        </Badge>
                      ) : (
                        <Badge tone="warning">Not listed</Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
          {missing.length > 0 ? (
            <Card>
              <div className="card-head">
                <h3>Missing references</h3>
                <Badge tone="error">{missing.length}</Badge>
              </div>
              <div className="card-body col" style={{ gap: 6 }}>
                {missing.map((entry) => (
                  <div key={`${entry.line}-${entry.name}`} className="issue-line">
                    <AlertTriangle size={13} className="text-warning" style={{ flexShrink: 0 }} />
                    <span>
                      <strong>line {entry.line}</strong> {entry.name} → <span className="mono">{entry.path}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : buffer ? (
            <div className="callout">
              <CheckCircle2 size={14} />
              <span>Every load entry resolves to an entity name or path in this project.</span>
            </div>
          ) : null}
          {showGenerated ? (
            <div className="callout">
              <Wand2 size={14} />
              <span>
                Generated entries from the current entities. Non-load header lines and comments from the
                existing manifest were preserved. Review the result before saving.
              </span>
            </div>
          ) : null}
          <div className="callout">
            <FileCode2 size={14} />
            <span>
              The manifest is stored in this project only. OpenBOR reads models.txt from your game's data
              directory, so copy or download it into the real OpenBOR workflow.
            </span>
          </div>
        </div>
      </div>

      <Card style={{ marginTop: 14 }}>
        <div className="card-head">
          <h3>Parsed load entries</h3>
          <span className="sub">{parsed.entries.length} lines</span>
        </div>
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th className="num">Line</th>
                <th>Command</th>
                <th>Model</th>
                <th>Path</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parsed.entries.map((entry) => {
                const entity = project.entities.find(
                  (candidate) =>
                    (candidate.summary.name ?? '').toLowerCase() === entry.name.toLowerCase(),
                );
                const pathMatch = entity
                  ? findMissingManifestEntities({ ...parsed, entries: [entry] }, [entity]).length === 0
                  : false;
                return (
                  <tr key={`${entry.line}-${entry.name}`}>
                    <td className="num">{entry.line + 1}</td>
                    <td className="mono small">{entry.command}</td>
                    <td className="mono small">{entry.name || '—'}</td>
                    <td className="mono small">{entry.path || '—'}</td>
                    <td>
                      {entity ? (
                        <Badge tone={pathMatch ? 'success' : 'warning'}>
                          {pathMatch ? 'Matched' : 'Name matched, path differs'}
                        </Badge>
                      ) : (
                        <Badge tone="error">Not imported</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {parsed.entries.length === 0 ? (
                <tr><td colSpan={5} className="muted small">No load or know entries yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

