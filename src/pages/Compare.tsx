import { ArrowLeftRight, GitCompareArrows, Pencil, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { compareModels, percentChange, round, type AnimationDiff, type HeaderDiff } from '../core/compare';
import { parseModel } from '../core/parser';
import type { ParsedModel, ProjectEntity } from '../core/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Tabs,
} from '../components/ui';
import { classNames, formatDate, formatNumber, typeLabel, typeTone } from '../lib/format';
import { navigate, useRoute } from '../lib/router';
import { useApp } from '../state/AppStore';

type Mode = 'entities' | 'revisions';

export function Compare() {
  const { activeProject } = useApp();
  const route = useRoute();
  const mode: Mode = route.query.get('mode') === 'revisions' ? 'revisions' : 'entities';
  const [changedOnly, setChangedOnly] = useState(true);

  if (!activeProject) {
    return (
      <>
        <PageHeader eyebrow="Analysis" title="Compare" subtitle="Compare two OpenBOR models or two saved revisions." />
        <EmptyState
          icon={GitCompareArrows}
          title="No active project"
          description="Select or create a project to compare its entities."
          actions={<Button onClick={() => navigate('projects')}>Open projects</Button>}
        />
      </>
    );
  }

  const changeMode = (next: Mode) => {
    navigate(`compare?mode=${next}`);
  };

  return (
    <>
      <PageHeader
        eyebrow={activeProject.name}
        title="Compare"
        subtitle="Compare health, speed, animation timing, damage, hits, header values, and per-animation changes. Every number comes from the imported or saved model text."
      />
      <div style={{ marginBottom: 16 }}>
        <Tabs
          items={[
            { id: 'entities', label: 'Entities' },
            { id: 'revisions', label: 'Revisions' },
          ]}
          value={mode}
          onChange={(value) => changeMode(value as Mode)}
          ariaLabel="Comparison source"
        />
      </div>
      {mode === 'entities' ? (
        <EntityCompare project={activeProject} routeQuery={route.query} changedOnly={changedOnly} setChangedOnly={setChangedOnly} />
      ) : (
        <RevisionCompare project={activeProject} routeQuery={route.query} changedOnly={changedOnly} setChangedOnly={setChangedOnly} />
      )}
    </>
  );
}

type Query = URLSearchParams;

function EntityCompare({
  project,
  routeQuery,
  changedOnly,
  setChangedOnly,
}: {
  project: NonNullable<ReturnType<typeof useApp>['activeProject']>;
  routeQuery: Query;
  changedOnly: boolean;
  setChangedOnly: (value: boolean) => void;
}) {
  const entities = project.entities;
  const defaultA = routeQuery.get('a') ?? project.lastOpenedEntityId ?? entities[0]?.id ?? '';
  const defaultB =
    routeQuery.get('b') ??
    entities.find((entity) => entity.id !== defaultA)?.id ??
    entities.find((entity) => entity.id === project.lastOpenedEntityId)?.id ??
    entities[0]?.id ??
    '';
  const a = entities.find((entity) => entity.id === defaultA) ?? entities[0];
  const b = entities.find((entity) => entity.id === defaultB) ?? entities.find((entity) => entity.id !== a?.id);

  if (entities.length < 2) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="Need at least two entities"
        description="Import another model into this project to compare characters, enemies, or variants."
        actions={<Button onClick={() => navigate('entities')}>View entities</Button>}
      />
    );
  }

  const setEntity = (key: 'a' | 'b', id: string) => {
    const query = new URLSearchParams(routeQuery);
    query.set('mode', 'entities');
    query.set(key, id);
    if (!query.get('a')) query.set('a', a?.id ?? '');
    if (!query.get('b')) query.set('b', b?.id ?? '');
    navigate(`compare?${query.toString()}`);
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="compare-pickers">
            <EntityPicker
              label="Entity A"
              entity={a}
              entities={entities}
              onChange={(id) => setEntity('a', id)}
            />
            <span className="compare-vs" aria-hidden="true">VS</span>
            <EntityPicker
              label="Entity B"
              entity={b}
              entities={entities}
              onChange={(id) => setEntity('b', id)}
            />
          </div>
        </div>
      </Card>
      {a && b ? (
        <ComparisonView
          a={a}
          b={b}
          changedOnly={changedOnly}
          setChangedOnly={setChangedOnly}
          headerActions={
            <div className="row" style={{ gap: 5 }}>
              <Button size="sm" icon={Pencil} onClick={() => navigate(`editor/${a.id}`)}>
                Edit A
              </Button>
              <Button size="sm" icon={Pencil} onClick={() => navigate(`editor/${b.id}`)}>
                Edit B
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  );
}

function RevisionCompare({
  project,
  routeQuery,
  changedOnly,
  setChangedOnly,
}: {
  project: NonNullable<ReturnType<typeof useApp>['activeProject']>;
  routeQuery: Query;
  changedOnly: boolean;
  setChangedOnly: (value: boolean) => void;
}) {
  const entitiesWithRevisions = project.entities.filter((entity) => entity.revisions.length > 0);
  const defaultEntityId =
    routeQuery.get('entity') ??
    project.lastOpenedEntityId ??
    entitiesWithRevisions[0]?.id ??
    project.entities[0]?.id ??
    '';
  const entity =
    project.entities.find((candidate) => candidate.id === defaultEntityId) ?? project.entities[0];
  const revisions = entity ? [...entity.revisions].sort((left, right) => right.savedAt - left.savedAt) : [];
  const options = [
    { id: 'current', label: 'Current saved text', raw: entity?.savedRaw ?? '', savedAt: entity?.updatedAt ?? 0 },
    ...revisions.map((revision) => ({
      id: revision.id,
      label: revision.label,
      raw: revision.raw,
      savedAt: revision.savedAt,
    })),
  ];
  const aId = routeQuery.get('a') ?? options[1]?.id ?? 'current';
  const bId = routeQuery.get('b') ?? 'current';
  const a = options.find((option) => option.id === aId) ?? options[0];
  const b = options.find((option) => option.id === bId) ?? options[0];

  if (!entity) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="No entities"
        description="Import a model to compare revisions."
        actions={<Button onClick={() => navigate('entities')}>View entities</Button>}
      />
    );
  }

  const setOption = (key: 'a' | 'b' | 'entity', id: string) => {
    const query = new URLSearchParams(routeQuery);
    query.set('mode', 'revisions');
    query.set('entity', entity.id);
    query.set(key, id);
    if (!query.get('a')) query.set('a', a?.id ?? 'current');
    if (!query.get('b')) query.set('b', b?.id ?? 'current');
    navigate(`compare?${query.toString()}`);
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div className="card-body col" style={{ gap: 12 }}>
          <label className="field" htmlFor="revision-entity">
            <span className="field-label">Entity</span>
            <select
              id="revision-entity"
              className="select"
              value={entity.id}
              onChange={(event) => setOption('entity', event.target.value)}
            >
              {project.entities.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.summary.name ?? candidate.fileName}
                </option>
              ))}
            </select>
          </label>
          <div className="compare-pickers">
            <RevisionPicker
              label="Revision A"
              value={a?.id ?? 'current'}
              options={options}
              onChange={(id) => setOption('a', id)}
            />
            <span className="compare-vs" aria-hidden="true">VS</span>
            <RevisionPicker
              label="Revision B"
              value={b?.id ?? 'current'}
              options={options}
              onChange={(id) => setOption('b', id)}
            />
          </div>
          {options.length < 2 ? (
            <div className="small muted">
              This entity has no saved revision history yet. Save it in the editor to create revisions.
            </div>
          ) : null}
        </div>
      </Card>
      {a && b && a.id !== b.id ? (
        <ComparisonView
          a={{ ...entity, raw: a.raw, summary: entity.summary }}
          b={{ ...entity, raw: b.raw, summary: entity.summary }}
          labelA={a.label}
          labelB={b.label}
          changedOnly={changedOnly}
          setChangedOnly={setChangedOnly}
          headerActions={
            <Button size="sm" icon={RefreshCw} onClick={() => navigate(`editor/${entity.id}`)}>
              Open editor
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={ArrowLeftRight}
          title="Choose two different revisions"
          description="Select revisions in the pickers above. Current saved text is included as an option."
        />
      )}
    </>
  );
}

function EntityPicker({
  label,
  entity,
  entities,
  onChange,
}: {
  label: string;
  entity: ProjectEntity | undefined;
  entities: ProjectEntity[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <label className="field">
        <span className="field-label">{label}</span>
        <select className="select" value={entity?.id ?? ''} onChange={(event) => onChange(event.target.value)}>
          {entities.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.summary.name ?? candidate.fileName} · {typeLabel(candidate.summary.type)}
            </option>
          ))}
        </select>
      </label>
      {entity ? (
        <div className="row small muted" style={{ gap: 6 }}>
          <Badge tone={typeTone(entity.summary.type)}>{typeLabel(entity.summary.type)}</Badge>
          <span className="mono truncate">{entity.fileName}</span>
        </div>
      ) : null}
    </div>
  );
}

function RevisionPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; savedAt: number }[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.id === 'current'
              ? ` · ${formatDate(option.savedAt)}`
              : option.savedAt
                ? ` · ${formatDate(option.savedAt)}`
                : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonView({
  a,
  b,
  labelA,
  labelB,
  changedOnly,
  setChangedOnly,
  headerActions,
}: {
  a: ProjectEntity;
  b: ProjectEntity;
  labelA?: string;
  labelB?: string;
  changedOnly: boolean;
  setChangedOnly: (value: boolean) => void;
  headerActions?: ReactNode;
}) {
  let modelA: ParsedModel | null = null;
  let modelB: ParsedModel | null = null;
  let parseError: string | null = null;
  try {
    modelA = parseModel(a.raw);
    modelB = parseModel(b.raw);
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Could not parse one of the models.';
  }

  if (!modelA || !modelB) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="Comparison unavailable"
        description={parseError ?? 'One of the selected models could not be parsed.'}
      />
    );
  }

  const comparison = compareModels(modelA, modelB);
  const headerRows = changedOnly ? comparison.changedHeaders : comparison.header;
  const animationRows = changedOnly ? comparison.animations.filter((row) => row.changed) : comparison.animations;
  const hasAnyChange = comparison.changedHeaders.length > 0 || comparison.animations.some((row) => row.changed) || comparison.metrics.some((metric) => metric.a !== metric.b);

  return (
    <div className="col" style={{ gap: 16 }}>
      <Card>
        <div className="card-body">
          <div className="row-between wrap">
            <div className="col" style={{ gap: 2 }}>
              <span className="page-eyebrow" style={{ marginBottom: 2 }}>Comparison</span>
              <strong style={{ fontSize: 17, color: 'var(--text-strong)' }}>
                {labelA ?? modelA.name ?? a.fileName}
                <span className="muted" style={{ fontWeight: 400 }}> vs </span>
                {labelB ?? modelB.name ?? b.fileName}
              </strong>
              <span className="small muted">
                {hasAnyChange ? 'Differences are highlighted below.' : 'The two selections are identical in the compared fields.'}
              </span>
            </div>
            {headerActions}
          </div>
        </div>
      </Card>

      <div className="metric-grid">
        {comparison.metrics.map((metric) => {
          const change = percentChange(metric.a, metric.b);
          const peak = Math.max(metric.a ?? 0, metric.b ?? 0, 1);
          return (
            <div className="metric-card" key={metric.label}>
              <span className="metric-label">{metric.label}</span>
              <div className="metric-values">
                <span>{metric.a === null ? '—' : formatNumber(metric.a, 1)}</span>
                <span className="arrow">→</span>
                <span className="b">{metric.b === null ? '—' : formatNumber(metric.b, 1)}</span>
                {change !== null ? (
                  <span className={classNames('metric-delta delta', change > 0 ? 'up' : change < 0 ? 'down' : 'flat')}>
                    {change > 0 ? '+' : ''}{change}%
                  </span>
                ) : null}
              </div>
              <div className="dual-bar">
                <span className="track"><span className="fill-a" style={{ display: 'block', height: '100%', width: `${((metric.a ?? 0) / peak) * 100}%` }} /></span>
                <span className="track"><span className="fill-b" style={{ display: 'block', height: '100%', width: `${((metric.b ?? 0) / peak) * 100}%` }} /></span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid-main">
        <Card>
          <div className="card-head">
            <div>
              <h3>Header differences</h3>
              <div className="sub">{comparison.changedHeaders.length} changed values</div>
            </div>
            <label className="checkbox small">
              <input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />
              Changed only
            </label>
          </div>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>A</th>
                  <th>B</th>
                </tr>
              </thead>
              <tbody>
                {headerRows.map((row: HeaderDiff) => (
                  <tr key={row.key}>
                    <td>
                      <div className="row-with-meta">
                        <span className="mono" style={{ fontSize: 10.5, color: row.changed ? 'var(--accent)' : 'var(--text)' }}>{row.key}</span>
                        <span className="meta">{row.label}</span>
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 10 }}>{row.a ?? '—'}</td>
                    <td className="mono" style={{ fontSize: 10, color: row.changed ? 'var(--teal)' : 'var(--muted)' }}>{row.b ?? '—'}</td>
                  </tr>
                ))}
                {headerRows.length === 0 ? (
                  <tr><td colSpan={3} className="muted small">No header differences.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <div className="card-head">
            <h3>At a glance</h3>
            <span className="sub">{formatNumber(modelA.stats.totalFrames)} → {formatNumber(modelB.stats.totalFrames)} frames</span>
          </div>
          <div className="card-body col" style={{ gap: 9 }}>
            <div className="row-between small"><span className="muted">Animations</span><span className="mono">{modelA.animations.length} → {modelB.animations.length}</span></div>
            <div className="row-between small"><span className="muted">Total delay</span><span className="mono">{formatNumber(modelA.stats.totalDelay)} → {formatNumber(modelB.stats.totalDelay)}</span></div>
            <div className="row-between small"><span className="muted">Damage</span><span className="mono">{formatNumber(modelA.stats.totalDamage)} → {formatNumber(modelB.stats.totalDamage)}</span></div>
            <div className="row-between small"><span className="muted">Separate hits</span><span className="mono">{formatNumber(modelA.stats.totalHits)} → {formatNumber(modelB.stats.totalHits)}</span></div>
            <div className="row-between small"><span className="muted">Max hit</span><span className="mono">{formatNumber(modelA.stats.maxHit)} → {formatNumber(modelB.stats.maxHit)}</span></div>
            <div className="row-between small"><span className="muted">Duration</span><span className="mono">{round(modelA.stats.durationSeconds)}s → {round(modelB.stats.durationSeconds)}s</span></div>
            <div className="divider" />
            <div className="small muted">
              Health, speed, and header fields are shown in the metric cards and header table. Animation
              changes are listed below.
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="card-head">
          <div>
            <h3>Animation changes</h3>
            <div className="sub">{comparison.animations.filter((row) => row.changed).length} changed or added blocks</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Animation</th>
                <th className="num">Frames A</th>
                <th className="num">Frames B</th>
                <th className="num">Delay A</th>
                <th className="num">Delay B</th>
                <th className="num">Damage A</th>
                <th className="num">Damage B</th>
                <th className="num">Hits A</th>
                <th className="num">Hits B</th>
              </tr>
            </thead>
            <tbody>
              {animationRows.map((row: AnimationDiff) => (
                <tr key={row.name} className={row.changed ? 'selected' : ''}>
                  <td>
                    <div className="row" style={{ gap: 5 }}>
                      <span className="mono" style={{ fontSize: 10.5 }}>{row.name}</span>
                      {row.aFrames === null ? <Badge tone="success">added</Badge> : null}
                      {row.bFrames === null ? <Badge tone="error">removed</Badge> : null}
                    </div>
                  </td>
                  <td className="num">{row.aFrames ?? '—'}</td>
                  <td className="num">{row.bFrames ?? '—'}</td>
                  <td className="num">{row.aDelay ?? '—'}</td>
                  <td className="num">{row.bDelay ?? '—'}</td>
                  <td className="num">{row.aDamage ?? '—'}</td>
                  <td className="num">{row.bDamage ?? '—'}</td>
                  <td className="num">{row.aHits ?? '—'}</td>
                  <td className="num">{row.bHits ?? '—'}</td>
                </tr>
              ))}
              {animationRows.length === 0 ? (
                <tr><td colSpan={9} className="muted small">No animation differences.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
