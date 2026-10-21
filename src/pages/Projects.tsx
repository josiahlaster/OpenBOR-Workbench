import {
  ArrowRight,
  Copy,
  Database,
  Download,
  FileCode2,
  FolderKanban,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { serializeProjectBundle } from '../core/projectIO';
import type { Project } from '../core/types';
import { useImport } from '../components/ImportDialog';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  StatCard,
} from '../components/ui';
import { downloadText, formatDate, relativeTime, slugify, typeLabel, typeTone } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { useApp } from '../state/AppStore';

export function Projects() {
  const {
    projects,
    activeProject,
    setActiveProject,
    createProject,
    renameProject,
    deleteProject,
    duplicateProject,
    importProjectBundleText,
    notify,
  } = useApp();
  const { openImport } = useImport();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const bundleInput = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setNewName('');
    setNewDescription('');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createProject(newName, newDescription);
      setCreateOpen(false);
      navigate('entities');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (project: Project) => {
    setEditing(project);
    setEditName(project.name);
    setEditDescription(project.description);
  };

  const submitEdit = async () => {
    if (!editing || !editName.trim()) return;
    setBusy(true);
    try {
      await renameProject(editing.id, editName, editDescription);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const exportProject = (project: Project) => {
    downloadText(
      `${slugify(project.name) || 'openbor-project'}.openborstats.json`,
      serializeProjectBundle(project),
      'application/json',
    );
    notify(`Exported "${project.name}" as a project bundle.`, 'success');
  };

  const importBundle = async (file: File) => {
    try {
      const text = await file.text();
      await importProjectBundleText(text);
      navigate('entities');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import this project bundle.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        subtitle="Projects are stored locally in this browser. Each project holds OpenBOR model files, an optional models.txt manifest, asset path indexes, and revision history."
        actions={
          <>
            <Button variant="primary" icon={FolderPlus} onClick={openCreate}>
              New project
            </Button>
            <Button icon={Upload} onClick={() => openImport('create')}>
              Import files
            </Button>
            <Button icon={FileCode2} onClick={() => bundleInput.current?.click()}>
              Import bundle
            </Button>
            <input
              ref={bundleInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBundle(file);
                event.target.value = '';
              }}
            />
          </>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects in this browser"
          description="Create an empty project or import OpenBOR model files. Nothing is uploaded to a server, and everything can be exported again."
          actions={
            <>
              <Button variant="primary" icon={Upload} onClick={() => openImport('create')}>
                Import model files
              </Button>
              <Button icon={Plus} onClick={openCreate}>
                Create empty project
              </Button>
            </>
          }
        />
      ) : (
        <>
          {activeProject ? (
            <Card style={{ marginBottom: 18 }}>
              <div className="card-body">
                <div className="row-between wrap" style={{ marginBottom: 14 }}>
                  <div>
                    <div className="page-eyebrow" style={{ marginBottom: 3 }}>Active project</div>
                    <div className="project-name" style={{ fontSize: 19 }}>{activeProject.name}</div>
                    <div className="small muted" style={{ marginTop: 3 }}>
                      {activeProject.description || 'No description'}
                    </div>
                  </div>
                  <div className="row wrap">
                    <Button icon={ArrowRight} onClick={() => navigate('entities')}>
                      Open entities
                    </Button>
                    <Button icon={FileCode2} onClick={() => navigate('manifest')}>
                      Manifest
                    </Button>
                    <Button icon={Download} onClick={() => exportProject(activeProject)}>
                      Export
                    </Button>
                  </div>
                </div>
                <div className="grid grid-4 stats-row">
                  <StatCard label="Entities" value={activeProject.entities.length} icon={Users} />
                  <StatCard
                    label="Animations"
                    value={activeProject.entities.reduce((sum, entity) => sum + entity.summary.animationCount, 0)}
                    icon={FileCode2}
                  />
                  <StatCard
                    label="Asset paths"
                    value={activeProject.assetPaths.length}
                    icon={Database}
                    foot="Indexed from imports"
                  />
                  <StatCard
                    label="Last updated"
                    value={relativeTime(activeProject.updatedAt)}
                    foot={formatDate(activeProject.updatedAt)}
                  />
                </div>
                <div className="row wrap" style={{ marginTop: 12 }}>
                  {(['player', 'enemy', 'npc', 'item'] as const).map((type) => {
                    const count = activeProject.entities.filter((entity) => entity.summary.type === type).length;
                    return (
                      <Badge key={type} tone={typeTone(type)}>
                        {count} {typeLabel(type)}
                      </Badge>
                    );
                  })}
                  <Badge tone={activeProject.modelsFile ? 'success' : 'warning'}>
                    {activeProject.modelsFile ? 'models.txt imported' : 'No models.txt'}
                  </Badge>
                </div>
              </div>
            </Card>
          ) : null}

          <div className="section-title">
            All projects <span className="count">{projects.length}</span>
          </div>
          <div className="grid grid-3">
            {projects.map((project) => {
              const counts = project.entities.reduce(
                (acc, entity) => {
                  const type = entity.summary.type ?? 'other';
                  acc[type] = (acc[type] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              );
              const errors = project.entities.reduce((sum, entity) => sum + entity.summary.errors, 0);
              const warnings = project.entities.reduce((sum, entity) => sum + entity.summary.warnings, 0);
              return (
                <Card
                  key={project.id}
                  className={`project-card${project.id === activeProject?.id ? ' active' : ''}`}
                >
                  <div className="card-body">
                    <div className="row-between" style={{ alignItems: 'flex-start' }}>
                      <a
                        href={routeHref('entities')}
                        className="project-name"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                        onClick={() => setActiveProject(project.id)}
                      >
                        {project.name}
                      </a>
                      {project.id === activeProject?.id ? <Badge tone="success">Active</Badge> : null}
                    </div>
                    <span className="project-desc">{project.description || 'No description'}</span>
                    <div className="project-metrics">
                      <div><strong>{project.entities.length}</strong><span>Entities</span></div>
                      <div><strong>{counts.player ?? 0}</strong><span>Players</span></div>
                      <div><strong>{counts.enemy ?? 0}</strong><span>Enemies</span></div>
                      <div>
                        <strong className={errors ? 'text-danger' : warnings ? 'text-warning' : ''}>
                          {errors + warnings}
                        </strong>
                        <span>Issues</span>
                      </div>
                    </div>
                    <div className="row small muted" style={{ marginTop: 2 }}>
                      <span>{relativeTime(project.updatedAt)}</span>
                      {project.modelsFile ? <Badge tone="neutral">models.txt</Badge> : null}
                    </div>
                  </div>
                  <div className="project-foot">
                    <div className="row" style={{ gap: 2 }}>
                      <IconButton icon={Pencil} label={`Edit ${project.name}`} size="sm" onClick={() => startEdit(project)} />
                      <IconButton icon={Copy} label={`Duplicate ${project.name}`} size="sm" onClick={() => void duplicateProject(project.id)} />
                      <IconButton icon={Download} label={`Export ${project.name}`} size="sm" onClick={() => exportProject(project)} />
                      <IconButton
                        icon={Trash2}
                        label={`Delete ${project.name}`}
                        size="sm"
                        className="text-danger"
                        onClick={() => setDeleting(project)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={project.id === activeProject?.id ? 'primary' : 'ghost'}
                      iconRight={ArrowRight}
                      onClick={() => {
                        setActiveProject(project.id);
                        navigate('entities');
                      }}
                    >
                      {project.id === activeProject?.id ? 'Continue' : 'Open'}
                    </Button>
                  </div>
                </Card>
              );
            })}
            <button
              type="button"
              className="card project-card"
              style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200, background: 'transparent', borderStyle: 'dashed' }}
              onClick={openCreate}
            >
              <span className="empty-icon"><Plus size={18} /></span>
              <strong style={{ fontSize: 13 }}>Create project</strong>
              <span className="small muted">Start empty, then import files</span>
            </button>
          </div>
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        subtitle="An empty project is created locally in this browser."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submitCreate()} disabled={!newName.trim() || busy} loading={busy}>
              Create project
            </Button>
          </>
        }
      >
        <Field label="Project name" htmlFor="new-project-name" required>
          <input
            id="new-project-name"
            className="input"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="My OpenBOR project"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitCreate();
            }}
          />
        </Field>
        <Field label="Description" htmlFor="new-project-description" hint="Optional. Visible on the dashboard.">
          <textarea
            id="new-project-description"
            className="textarea"
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
            placeholder="Notes about the game, module, or characters in this project"
          />
        </Field>
        <div className="small muted">
          Need to import immediately? <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setCreateOpen(false); openImport('create'); }}>Use the file importer</button> instead.
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submitEdit()} disabled={!editName.trim() || busy} loading={busy}>
              Save changes
            </Button>
          </>
        }
      >
        <Field label="Project name" htmlFor="edit-project-name" required>
          <input
            id="edit-project-name"
            className="input"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="edit-project-description">
          <textarea
            id="edit-project-description"
            className="textarea"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void deleteProject(deleting.id);
        }}
        title={`Delete "${deleting?.name ?? ''}"?`}
        description={
          <>
            This removes the project, its {deleting?.entities.length ?? 0} saved entities, revision history,
            and drafts from this browser. Downloaded .txt files are not affected. This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        danger
      />
    </>
  );
}
