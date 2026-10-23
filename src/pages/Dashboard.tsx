import {
  ArrowRight,
  BookOpen,
  Boxes,
  Database,
  FileCode2,
  FolderKanban,
  FolderPlus,
  Film,
  HeartPulse,
  ShieldCheck,
  Swords,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import { useMemo } from 'react';
import { useImport } from '../components/ImportDialog';
import {
  Badge,
  BarList,
  Button,
  Card,
  EmptyState,
  MiniChart,
  PageHeader,
  SeverityIcon,
  StatCard,
} from '../components/ui';
import { entityKind, formatDate, formatNumber, relativeTime, typeLabel, typeTone } from '../lib/format';
import { navigate, routeHref } from '../lib/router';
import { useApp } from '../state/AppStore';

export function Dashboard() {
  const { activeProject, projects, validation, setActiveProject } = useApp();
  const { openImport } = useImport();

  const metrics = useMemo(() => {
    const entities = activeProject?.entities ?? [];
    const counts = { player: 0, enemy: 0, npc: 0, item: 0, other: 0 };
    for (const entity of entities) counts[entityKind(entity.summary.type)] += 1;
    const animations = entities.reduce((sum, entity) => sum + entity.summary.animationCount, 0);
    const frames = entities.reduce((sum, entity) => sum + entity.summary.frameCount, 0);
    const damage = entities.reduce((sum, entity) => sum + entity.summary.totalDamage, 0);
    const recent = [...entities].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const healthValues = entities
      .filter((entity) => ['player', 'enemy', 'npc'].includes(entityKind(entity.summary.type)))
      .map((entity) => entity.summary.health)
      .filter((value): value is number => value !== null && value > 0);
    const speeds = entities
      .map((entity) => entity.summary.speed)
      .filter((value): value is number => value !== null && value > 0);
    const damageLeaders = [...entities]
      .filter((entity) => entity.summary.totalDamage > 0)
      .sort((a, b) => b.summary.totalDamage - a.summary.totalDamage)
      .slice(0, 6)
      .map((entity) => ({
        label: entity.summary.name ?? entity.fileName,
        value: entity.summary.totalDamage,
      }));
    const issues = validation
      ? Object.values(validation.perEntity).flat().sort((a, b) => {
          const rank = { error: 0, warning: 1, info: 2 } as const;
          return rank[a.severity] - rank[b.severity];
        })
      : [];
    return { entities, counts, animations, frames, damage, recent, healthValues, speeds, damageLeaders, issues };
  }, [activeProject, validation]);

  const healthBuckets = useMemo(() => bucketize(metrics.healthValues), [metrics.healthValues]);
  const speedBuckets = useMemo(() => bucketize(metrics.speeds), [metrics.speeds]);

  if (!activeProject) {
    return (
      <>
        <PageHeader
          eyebrow="OpenBOR Workbench"
          title="Edit, validate and compare OpenBOR game data."
          subtitle="OpenBOR Workbench is a browser-based editor for OpenBOR data folders. Import character, level and models.txt files, check them for errors, compare entities side by side, and edit their fields. Changes are saved to local projects, and exports keep the original .txt format, including comments, scripts, spacing, and unknown commands."
          actions={
            <>
              <Button variant="primary" icon={FolderPlus} onClick={() => openImport('create')}>
                Import a project
              </Button>
              <Button icon={BookOpen} onClick={() => navigate('docs')}>
                Read the docs
              </Button>
            </>
          }
        />
        <div className="hero">
          <div>
            <div className="page-eyebrow">Local-first · no account required</div>
            <h1>Your OpenBOR projects, all in one place.</h1>
            <p>
              Open a project to see its characters, enemies, levels and manifest in one workspace. Each file is
              checked as you go, so you can spot broken references before you run the game. Your data stays in
              this browser, and exports write the same .txt files back out.
            </p>
            <div className="hero-actions">
              <Button variant="primary" icon={Upload} onClick={() => openImport('create')} size="lg">
                Import files
              </Button>
              <Button icon={FolderKanban} onClick={() => navigate('projects')} size="lg">
                Manage projects
              </Button>
            </div>
          </div>
          <div className="hero-panel">
            <div className="line"><span>Parsing</span><strong>model .txt</strong></div>
            <div className="line"><span>Manifests</span><strong>models.txt</strong></div>
            <div className="line"><span>Storage</span><strong>IndexedDB</strong></div>
            <div className="line"><span>Export</span><strong>original text</strong></div>
            <div className="line"><span>Network calls</span><strong>none</strong></div>
          </div>
        </div>
        <div className="grid grid-3">
          <Card>
            <div className="card-body col">
              <div className="empty-icon"><FileCode2 size={18} /></div>
              <strong>Lossless editing</strong>
              <span className="small muted">
                Header and frame edits are precise line patches. Everything else stays byte-for-byte.
              </span>
            </div>
          </Card>
          <Card>
            <div className="card-body col">
              <div className="empty-icon"><ShieldCheck size={18} /></div>
              <strong>Engine-aware checks</strong>
              <span className="small muted">
                Required headers, numeric ranges, attack boxes, animations, and models.txt references.
              </span>
            </div>
          </Card>
          <Card>
            <div className="card-body col">
              <div className="empty-icon"><Swords size={18} /></div>
              <strong>Real comparison</strong>
              <span className="small muted">
                Compare health, speed, frame timing, damage, and separate hits between entities or revisions.
              </span>
            </div>
          </Card>
        </div>
        <div className="section-title" style={{ marginTop: 26 }}>
          Saved projects <span className="count">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No projects yet"
            description="Create a project from imported model files. Projects are stored only in this browser until you export them."
            actions={
              <Button variant="primary" icon={Upload} onClick={() => openImport('create')}>
                Import your first project
              </Button>
            }
          />
        ) : (
          <div className="grid grid-3">
            {projects.slice(0, 3).map((project) => (
              <ProjectMiniCard key={project.id} project={project} onOpen={() => {
                setActiveProject(project.id);
                navigate('entities');
              }} />
            ))}
          </div>
        )}
      </>
    );
  }

  const project = activeProject;
  const errorCount = validation?.errors ?? 0;
  const warningCount = validation?.warnings ?? 0;
  const manifestEntries = project.modelsFile
    ? project.modelsFile.split(/\r\n|\n|\r/).filter((line) => /^\s*(load|know)\s/i.test(line)).length
    : 0;

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Project dashboard"
        subtitle={
          <>
            {project.entities.length === 0
              ? 'This project is empty. Import model files to start analysing them.'
              : `${project.entities.length} entities across ${metrics.animations} animations and ${formatNumber(metrics.frames)} frames. Last updated ${relativeTime(project.updatedAt)}.`}
          </>
        }
        actions={
          <>
            <Button variant="primary" icon={Upload} onClick={() => openImport('into')}>
              Import files
            </Button>
            <Button icon={FileCode2} onClick={() => navigate('entities')}>
              Browse entities
            </Button>
          </>
        }
      />

      <div className="grid grid-4 stats-row" style={{ marginBottom: 14 }}>
        <StatCard label="Entities" value={project.entities.length} icon={Users} foot={`${metrics.counts.player} players · ${metrics.counts.enemy} enemies`} />
        <StatCard label="Animations" value={metrics.animations} icon={Film} foot={`${formatNumber(metrics.frames)} frames`} />
        <StatCard label="Attack damage" value={formatNumber(metrics.damage)} icon={Zap} tone="accent" foot="Sum of animation attack windows" />
        <StatCard
          label="Validation"
          value={`${errorCount} / ${warningCount}`}
          icon={ShieldCheck}
          tone={errorCount > 0 ? 'danger' : undefined}
          foot="Errors / warnings"
        />
      </div>

      {project.entities.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="This project has no entities"
          description="Import OpenBOR model .txt files, or choose a folder that contains a data directory. The importer also understands models.txt and indexes asset paths for reference checks."
          actions={
            <>
              <Button variant="primary" icon={Upload} onClick={() => openImport('into')}>
                Import model files
              </Button>
              <Button icon={BookOpen} onClick={() => navigate('docs')}>
                Supported formats
              </Button>
            </>
          }
        />
      ) : (
        <>
          <div className="grid grid-4 stats-row" style={{ marginBottom: 18 }}>
            <StatCard label="Players" value={metrics.counts.player} icon={Users} foot="type player" />
            <StatCard label="Enemies" value={metrics.counts.enemy} icon={Swords} foot="type enemy" />
            <StatCard label="NPCs & items" value={metrics.counts.npc + metrics.counts.item} icon={Boxes} foot={`${metrics.counts.npc} NPC · ${metrics.counts.item} item`} />
            <StatCard label="Other types" value={metrics.counts.other} icon={FileCode2} foot="Obstacles, traps, panels…" />
          </div>

          <div className="grid grid-main" style={{ marginBottom: 18 }}>
            <Card>
              <div className="card-head">
                <div>
                  <h3>Damage by entity</h3>
                  <div className="sub">Total attack damage across each entity's animation windows</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('compare')}>
                  Compare <ArrowRight size={13} />
                </Button>
              </div>
              <div className="card-body">
                <BarList items={metrics.damageLeaders} emptyLabel="No attack boxes with positive damage were found." />
              </div>
            </Card>
            <Card>
              <div className="card-head">
                <h3>Recent activity</h3>
                <span className="sub">{formatDate(project.updatedAt)}</span>
              </div>
              <div className="card-body" style={{ paddingTop: 8 }}>
                {metrics.recent.map((entity) => (
                  <a
                    key={entity.id}
                    href={routeHref(`editor/${entity.id}`)}
                    className="recent-row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <span className="entity-avatar">
                      {(entity.summary.name ?? entity.fileName).slice(0, 2)}
                    </span>
                    <span className="row-with-meta" style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{entity.summary.name ?? entity.fileName}</span>
                      <span className="meta">{entity.fileName}</span>
                    </span>
                    <Badge tone={typeTone(entity.summary.type)}>{typeLabel(entity.summary.type)}</Badge>
                  </a>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-3" style={{ marginBottom: 18 }}>
            <Card>
              <div className="card-head">
                <h3>Health distribution</h3>
                <HeartPulse size={14} className="muted" />
              </div>
              <div className="card-body">
                {metrics.healthValues.length > 0 ? (
                  <>
                    <MiniChart
                      values={healthBuckets.map((bucket) => bucket.count)}
                      labels={healthBuckets.map((bucket) => bucket.label)}
                      ariaLabel="Distribution of entity health values"
                    />
                    <div className="row-between small muted" style={{ marginTop: 8 }}>
                      <span>{metrics.healthValues.length} entities with health</span>
                      <span className="mono">{formatNumber(Math.max(...metrics.healthValues))} max</span>
                    </div>
                  </>
                ) : (
                  <div className="muted small">No positive health values yet. Import character or enemy models.</div>
                )}
              </div>
            </Card>
            <Card>
              <div className="card-head">
                <h3>Speed distribution</h3>
                <span className="sub">Walking speed</span>
              </div>
              <div className="card-body">
                {metrics.speeds.length > 0 ? (
                  <>
                    <MiniChart
                      values={speedBuckets.map((bucket) => bucket.count)}
                      labels={speedBuckets.map((bucket) => bucket.label)}
                      ariaLabel="Distribution of entity walking speeds"
                    />
                    <div className="row-between small muted" style={{ marginTop: 8 }}>
                      <span>{metrics.speeds.length} entities with speed</span>
                      <span className="mono">{formatNumber(Math.max(...metrics.speeds))} max</span>
                    </div>
                  </>
                ) : (
                  <div className="muted small">No walking speed values yet.</div>
                )}
              </div>
            </Card>
            <Card>
              <div className="card-head">
                <h3>Project files</h3>
                <Database size={14} className="muted" />
              </div>
              <div className="card-body col" style={{ gap: 8 }}>
                <div className="row-between small">
                  <span className="muted">models.txt</span>
                  <span className={project.modelsFile ? 'text-success' : 'text-warning'}>
                    {project.modelsFile ? `${manifestEntries} load lines` : 'Not imported'}
                  </span>
                </div>
                <div className="row-between small">
                  <span className="muted">Asset paths indexed</span>
                  <span className="mono">{formatNumber(project.assetPaths.length)}</span>
                </div>
                <div className="row-between small">
                  <span className="muted">Entities with errors</span>
                  <span className={errorCount ? 'text-danger' : 'text-success'}>
                    {validation ? Object.values(validation.perEntity).filter((items) => items.some((item) => item.severity === 'error')).length : 0}
                  </span>
                </div>
                <Button size="sm" icon={FileCode2} onClick={() => navigate('manifest')} style={{ marginTop: 3 }}>
                  Open manifest
                </Button>
              </div>
            </Card>
          </div>

          <Card>
            <div className="card-head">
              <div>
                <h3>Validation highlights</h3>
                <div className="sub">Live from the saved entity text</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => navigate('validation')}>
                View all <ArrowRight size={13} />
              </Button>
            </div>
            <div className="card-body col" style={{ gap: 7 }}>
              {metrics.issues.length === 0 ? (
                <div className="row small text-success">
                  <ShieldCheck size={14} />
                  No validation issues in this project.
                </div>
              ) : (
                metrics.issues.slice(0, 4).map((item, index) => (
                  <div className={`finding ${item.severity}`} key={`${item.code}-${index}`}>
                    <span className="finding-icon">
                      <SeverityIcon severity={item.severity} />
                    </span>
                    <div className="finding-body">
                      <span className="finding-message">{item.message}</span>
                      <span className="finding-meta">
                        <span>{item.code}</span>
                        {item.line ? <span>line {item.line}</span> : null}
                        {item.animation ? <span>{item.animation}</span> : null}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}

      <div className="section-title" style={{ marginTop: 26 }}>
        Projects <span className="count">{projects.length}</span>
      </div>
      <div className="grid grid-3">
        {projects.map((item) => (
          <ProjectMiniCard
            key={item.id}
            project={item}
            active={item.id === project.id}
            onOpen={() => {
              setActiveProject(item.id);
              navigate('entities');
            }}
          />
        ))}
        <button
          type="button"
          className="card project-card"
          style={{ alignItems: 'center', justifyContent: 'center', minHeight: 180, background: 'transparent', borderStyle: 'dashed' }}
          onClick={() => openImport('create')}
        >
          <span className="empty-icon"><FolderPlus size={18} /></span>
          <strong style={{ fontSize: 13 }}>New project</strong>
          <span className="small muted">Import another data folder</span>
        </button>
      </div>
    </>
  );
}

function ProjectMiniCard({
  project,
  active,
  onOpen,
}: {
  project: ReturnType<typeof useApp>['projects'][number];
  active?: boolean;
  onOpen: () => void;
}) {
  const errors = project.entities.reduce((sum, entity) => sum + entity.summary.errors, 0);
  return (
    <Card className={`project-card${active ? ' active' : ''}`}>
      <div className="card-body">
        <div className="row-between">
          <span className="project-name">{project.name}</span>
          {active ? <Badge tone="success">Active</Badge> : null}
        </div>
        <span className="project-desc">{project.description || 'No description'}</span>
        <div className="project-metrics">
          <div><strong>{project.entities.length}</strong><span>Entities</span></div>
          <div><strong>{project.entities.reduce((sum, entity) => sum + entity.summary.animationCount, 0)}</strong><span>Animations</span></div>
          <div><strong className={errors ? 'text-danger' : ''}>{errors}</strong><span>Errors</span></div>
        </div>
      </div>
      <div className="project-foot">
        <span className="tiny muted">{relativeTime(project.updatedAt)}</span>
        <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={onOpen}>
          Open
        </Button>
      </div>
    </Card>
  );
}

function bucketize(values: number[]): { label: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: String(min), count: values.length }];
  const bucketCount = 6;
  const width = (max - min) / bucketCount;
  const formatEdge = (value: number) =>
    Number.isInteger(width) ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
  return Array.from({ length: bucketCount }, (_, index) => {
    const from = min + width * index;
    const to = index === bucketCount - 1 ? max : min + width * (index + 1);
    return {
      label: `${formatEdge(from)}–${formatEdge(to)}`,
      count: values.filter((value) =>
        index === bucketCount - 1 ? value >= from && value <= to : value >= from && value < to,
      ).length,
    };
  });
}
