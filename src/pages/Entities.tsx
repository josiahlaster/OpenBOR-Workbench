import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Copy,
  Download,
  FileCode2,
  Pencil,
  Play,
  SearchX,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useImport } from '../components/ImportDialog';
import { ProjectTree } from '../components/ProjectTree';
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
  SearchInput,
} from '../components/ui';
import type { ProjectEntity } from '../core/types';
import { playProjectInBrowser } from '../lib/playtest';
import { downloadText, entityKind, formatNumber, relativeTime, typeLabel, typeTone } from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../state/AppStore';

type TypeFilter = 'all' | 'player' | 'enemy' | 'npc' | 'item' | 'other';
type SortKey = 'name' | 'updated' | 'damage' | 'health' | 'issues';

const TYPE_TABS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'player', label: 'Players' },
  { id: 'enemy', label: 'Enemies' },
  { id: 'npc', label: 'NPCs' },
  { id: 'item', label: 'Items' },
  { id: 'other', label: 'Other' },
];

export function Entities() {
  const {
    activeProject,
    drafts,
    validation,
    deleteEntity,
    duplicateEntity,
    notify,
    renameEntity,
    setActiveProject,
  } = useApp();
  const { openImport } = useImport();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('updated');
  const [deleting, setDeleting] = useState<ProjectEntity | null>(null);
  const [renaming, setRenaming] = useState<ProjectEntity | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [view, setView] = useState<'tree' | 'table'>('tree');

  /** Prefer live validation counts; stored summaries can be stale after a catalog change. */
  const issueCounts = useMemo(() => {
    const counts = new Map<string, { errors: number; warnings: number }>();
    for (const entity of activeProject?.entities ?? []) {
      const findings = validation?.perEntity[entity.id];
      if (!findings) {
        counts.set(entity.id, { errors: entity.summary.errors, warnings: entity.summary.warnings });
        continue;
      }
      counts.set(entity.id, {
        errors: findings.filter((finding) => finding.severity === 'error').length,
        warnings: findings.filter((finding) => finding.severity === 'warning').length,
      });
    }
    return counts;
  }, [activeProject, validation]);
  const issuesFor = (entity: ProjectEntity) =>
    issueCounts.get(entity.id) ?? { errors: entity.summary.errors, warnings: entity.summary.warnings };

  const filtered = useMemo(() => {
    if (!activeProject) return [];
    const term = query.trim().toLowerCase();
    const items = activeProject.entities.filter((entity) => {
      if (typeFilter !== 'all' && entityKind(entity.summary.type) !== typeFilter) return false;
      const counts = issuesFor(entity);
      if (issuesOnly && counts.errors + counts.warnings === 0) return false;
      if (!term) return true;
      return [entity.summary.name, entity.fileName, entity.path, entity.summary.type, entity.summary.subtype]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
    const compare = (a: ProjectEntity, b: ProjectEntity): number => {
      switch (sort) {
        case 'name':
          return (a.summary.name ?? a.fileName).localeCompare(b.summary.name ?? b.fileName);
        case 'damage':
          return b.summary.totalDamage - a.summary.totalDamage;
        case 'health':
          return (b.summary.health ?? -1) - (a.summary.health ?? -1);
        case 'issues': {
          const left = issuesFor(a);
          const right = issuesFor(b);
          return right.errors + right.warnings - (left.errors + left.warnings);
        }
        default:
          return b.updatedAt - a.updatedAt;
      }
    };
    return [...items].sort(compare);
  }, [activeProject, issueCounts, issuesOnly, query, sort, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<TypeFilter, number> = { all: 0, player: 0, enemy: 0, npc: 0, item: 0, other: 0 };
    for (const entity of activeProject?.entities ?? []) {
      counts.all += 1;
      counts[entityKind(entity.summary.type)] += 1;
    }
    return counts;
  }, [activeProject]);

  if (!activeProject) {
    return (
      <>
        <PageHeader eyebrow="Workspace" title="Entities" subtitle="Choose a project to browse its characters, enemies, bosses, NPCs, items, and other OpenBOR models." />
        <EmptyState
          icon={Users}
          title="No active project"
          description="Create or select a project first. Projects are local to this browser."
          actions={
            <>
              <Button variant="primary" onClick={() => navigate('projects')}>Open projects</Button>
              <Button icon={Upload} onClick={() => openImport('create')}>Import files</Button>
            </>
          }
        />
      </>
    );
  }

  const openEditor = (entity: ProjectEntity) => {
    setActiveProject(activeProject.id);
    navigate(`editor/${entity.id}`);
  };

  const downloadEntity = (entity: ProjectEntity) => {
    downloadText(entity.fileName, entity.raw, 'text/plain');
  };

  const playInBrowser = async () => {
    try {
      const unsaved = Object.fromEntries(
        activeProject.entities
          .filter((entity) => drafts[entity.id]?.raw !== undefined)
          .map((entity) => [entity.id, drafts[entity.id].raw]),
      );
      await playProjectInBrowser(activeProject, unsaved);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start the game in the browser.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={activeProject.name}
        title="Entities"
        subtitle="Characters, enemies, bosses, NPCs, items, and other models registered in this project. Search by model name, file, path, or type."
        actions={
          <>
            <Button variant="primary" icon={Upload} onClick={() => openImport('into')}>
              Import files
            </Button>
            <Button icon={FileCode2} onClick={() => navigate('manifest')}>
              models.txt
            </Button>
            <Button
              icon={Play}
              disabled={activeProject.entities.length === 0}
              onClick={() => void playInBrowser()}
            >
              Play 
            </Button>
          </>
        }
      />

      <div className="segmented view-toggle" role="group" aria-label="Entity view" style={{ marginBottom: 14 }}>
        <button type="button" className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>
          Project tree
        </button>
        <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
          Table
        </button>
      </div>

      {view === 'table' ? (
      <Card style={{ marginBottom: 14 }}>
        <div className="card-body tight">
          <div className="row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
            <div className="segmented" role="group" aria-label="Filter by entity type">
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={typeFilter === tab.id ? 'active' : ''}
                  onClick={() => setTypeFilter(tab.id)}
                >
                  {tab.label}
                  <span className="muted" style={{ marginLeft: 5, fontFamily: 'var(--mono)', fontSize: 9.5 }}>
                    {typeCounts[tab.id]}
                  </span>
                </button>
              ))}
            </div>
            <div className="row wrap">
              <label className="checkbox small">
                <input
                  type="checkbox"
                  checked={issuesOnly}
                  onChange={(event) => setIssuesOnly(event.target.checked)}
                />
                With issues only
              </label>
              <SearchInput value={query} onChange={setQuery} placeholder="Search entities…" width={240} />
              <label className="row small muted" htmlFor="entity-sort">
                <ArrowUpDown size={13} />
                <span className="sr-only">Sort entities</span>
                <select
                  id="entity-sort"
                  className="select sm"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  style={{ width: 140 }}
                >
                  <option value="updated">Last updated</option>
                  <option value="name">Name A–Z</option>
                  <option value="damage">Damage</option>
                  <option value="health">Health</option>
                  <option value="issues">Issues</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </Card>
      ) : null}

      {view === 'tree' ? (
        <ProjectTree entities={activeProject.entities} projectId={activeProject.id} onOpen={openEditor} />
      ) : activeProject.entities.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No entities in this project"
          description="Import OpenBOR model .txt files, or a data folder. The importer preserves original text and can also register models.txt."
          actions={
            <>
              <Button variant="primary" icon={Upload} onClick={() => openImport('into')}>Import model files</Button>
              <Button onClick={() => navigate('docs')}>Read supported formats</Button>
            </>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No entities match these filters"
          description="Clear the search or choose a different entity type to see the rest of the project."
          actions={
            <Button
              onClick={() => {
                setQuery('');
                setTypeFilter('all');
                setIssuesOnly(false);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="card-head">
            <div>
              <h3>Entity list</h3>
              <div className="sub">
                {filtered.length} of {activeProject.entities.length} entities
              </div>
            </div>
            <div className="row small muted">
              <ShieldCheck size={13} />
              {filtered.filter((entity) => {
                const counts = issuesFor(entity);
                return counts.errors === 0 && counts.warnings === 0;
              }).length} clean
            </div>
          </div>
          <div className="table-wrap">
            <table className="table entity-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th className="col-type">Type</th>
                  <th className="num col-anims">Anims</th>
                  <th className="num col-frames">Frames</th>
                  <th className="num col-damage">Damage</th>
                  <th className="num col-health">Health</th>
                  <th className="num col-speed">Speed</th>
                  <th>Issues</th>
                  <th className="hide-mobile col-updated">Updated</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entity) => {
                  const issues = issuesFor(entity);
                  const issueCount = issues.errors + issues.warnings;
                  return (
                    <tr key={entity.id}>
                      <td>
                        <div className="row" style={{ gap: 9 }}>
                          <span className="entity-avatar">
                            {(entity.summary.name ?? entity.fileName).slice(0, 2)}
                          </span>
                          <div className="row-with-meta" style={{ minWidth: 0 }}>
                            <a
                              href={`#/editor/${entity.id}`}
                              className="truncate"
                              onClick={(event) => {
                                event.preventDefault();
                                openEditor(entity);
                              }}
                              style={{ maxWidth: 280 }}
                            >
                              {entity.summary.name ?? entity.fileName}
                            </a>
                            <span className="meta truncate" style={{ maxWidth: 300 }}>
                              {entity.path}
                            </span>
                          </div>
                          {drafts[entity.id] ? <Badge tone="warning">Draft</Badge> : null}
                        </div>
                      </td>
                      <td className="col-type">
                        <Badge tone={typeTone(entity.summary.type)}>{typeLabel(entity.summary.type)}</Badge>
                        {entity.summary.subtype ? (
                          <div className="tiny muted-2 mono" style={{ marginTop: 2 }}>
                            {entity.summary.subtype}
                          </div>
                        ) : null}
                      </td>
                      <td className="num col-anims">{formatNumber(entity.summary.animationCount)}</td>
                      <td className="num col-frames">{formatNumber(entity.summary.frameCount)}</td>
                      <td className="num col-damage">{formatNumber(entity.summary.totalDamage)}</td>
                      <td className="num col-health">{formatNumber(entity.summary.health)}</td>
                      <td className="num col-speed">{formatNumber(entity.summary.speed)}</td>
                      <td>
                        {entity.summary.parseError ? (
                          <Badge tone="error" icon={AlertCircle}>Parse error</Badge>
                        ) : issueCount === 0 ? (
                          <Badge tone="success" icon={ShieldCheck}>Clean</Badge>
                        ) : (
                          <div className="row" style={{ gap: 4 }}>
                            {issues.errors > 0 ? (
                              <Badge tone="error" icon={AlertCircle}>{issues.errors}</Badge>
                            ) : null}
                            {issues.warnings > 0 ? (
                              <Badge tone="warning" icon={AlertTriangle}>{issues.warnings}</Badge>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="hide-mobile small muted col-updated">{relativeTime(entity.updatedAt)}</td>
                      <td className="actions">
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 1 }}>
                          <IconButton icon={Pencil} label={`Edit ${entity.fileName}`} size="sm" onClick={() => openEditor(entity)} />
                          <IconButton icon={Download} label={`Download ${entity.fileName}`} size="sm" onClick={() => downloadEntity(entity)} />
                          <IconButton
                            icon={Copy}
                            label={`Duplicate ${entity.fileName}`}
                            size="sm"
                            onClick={() => void duplicateEntity(activeProject.id, entity.id)}
                          />
                          <IconButton
                            icon={FileCode2}
                            label="Rename file"
                            size="sm"
                            onClick={() => {
                              setRenaming(entity);
                              setNewFileName(entity.fileName);
                            }}
                          />
                          <IconButton icon={Trash2} label={`Delete ${entity.fileName}`} size="sm" className="text-danger" onClick={() => setDeleting(entity)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void deleteEntity(activeProject.id, deleting.id);
        }}
        title={`Delete "${deleting?.summary.name ?? deleting?.fileName ?? ''}"?`}
        description={
          <>
            The entity, its revisions, and any autosaved draft will be removed from this project. This
            cannot be undone unless you have exported the file. Other files are untouched.
          </>
        }
        confirmLabel="Delete entity"
        danger
      />

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename model file"
        subtitle="This changes the file name and its path. The model name header and models.txt are not changed automatically."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!newFileName.trim()}
              onClick={() => {
                if (renaming) void renameEntity(activeProject.id, renaming.id, newFileName);
                setRenaming(null);
              }}
            >
              Rename file
            </Button>
          </>
        }
      >
        <Field label="File name" htmlFor="rename-file" hint="Must end in .txt">
          <input
            id="rename-file"
            className="input mono"
            value={newFileName}
            onChange={(event) => setNewFileName(event.target.value)}
          />
        </Field>
        {renaming ? <div className="small muted mono">{renaming.path}</div> : null}
        <div className="callout">
          <FileCode2 size={14} />
          <span>Use the editor's Header tab to change the OpenBOR model name. Update models.txt after renaming a file if it lists this path.</span>
        </div>
      </Modal>
    </>
  );
}
