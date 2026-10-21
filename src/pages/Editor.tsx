import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  History,
  Info,
  Layers,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Undo2,
  Redo2,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addFrameAfter,
  addHeaderCommand,
  removeHeaderLine,
  setAnimationLoop,
  setFrameAttack,
  setFrameImage,
  setFrameProperty,
  setHeaderField,
  setHeaderLineArgs,
} from '../core/editor';
import { FIELD_BY_KEY, FIELD_SECTIONS } from '../core/fields';
import { compareModels, round } from '../core/compare';
import { parseModel, tokenizeLine } from '../core/parser';
import { summaryFromModel } from '../core/summary';
import type {
  AttackBox,
  HeaderFieldSpec,
  ModelAnimation,
  ModelFrame,
  ParsedModel,
  ProjectEntity,
  ValidationFinding,
} from '../core/types';
import { validateModel } from '../core/validation';
import { SpritePreview } from '../components/SpritePreview';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Tabs,
  type TabItem,
} from '../components/ui';
import {
  basename,
  classNames,
  downloadText,
  formatDate,
  formatNumber,
  typeLabel,
  typeTone,
} from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../state/AppStore';

type EditorTab = 'overview' | 'stats' | 'frames' | 'header' | 'raw' | 'history' | 'validation';
type SeverityFilter = 'all' | 'error' | 'warning' | 'info';

interface AnimationKey {
  name: string;
  occurrence: number;
}

function occurrenceFor(model: ParsedModel, name: string, line: number): number {
  let count = 0;
  for (const animation of model.animations) {
    if (animation.name.toLowerCase() === name.toLowerCase()) {
      if (animation.line === line) return count;
      count += 1;
    }
  }
  return 0;
}

function findAnimation(model: ParsedModel, key: AnimationKey | null): ModelAnimation | undefined {
  if (!key) return model.animations[0];
  let count = 0;
  for (const animation of model.animations) {
    if (animation.name.toLowerCase() === key.name.toLowerCase()) {
      if (count === key.occurrence) return animation;
      count += 1;
    }
  }
  return model.animations[0];
}

export function Editor() {
  const {
    activeProject,
    drafts,
    saveEntity,
    saveDraft,
    clearDraft,
    rememberEntity,
    notify,
  } = useApp();
  const routeEntityId = window.location.hash.replace(/^#\/editor\//, '').split('?')[0];

  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [rawBuffer, setRawBuffer] = useState('');
  const rawBufferRef = useRef('');
  const previousRawRef = useRef('');
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>('raw');
  const [saving, setSaving] = useState(false);
  const [draftNotice, setDraftNotice] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [addFrameOpen, setAddFrameOpen] = useState(false);
  const [newFramePath, setNewFramePath] = useState('');
  const [animKey, setAnimKey] = useState<AnimationKey | null>(null);
  const [frameNumber, setFrameNumber] = useState(1);
  const rawRef = useRef(raw);
  rawRef.current = raw;

  const currentEntity = activeProject?.entities.find((candidate) => candidate.id === routeEntityId);

  useEffect(() => {
    if (!currentEntity) return;
    const draft = drafts[currentEntity.id];
    const initial = draft?.raw ?? currentEntity.raw;
    setLoadedId(currentEntity.id);
    setRaw(initial);
    setRawBuffer(initial);
    rawBufferRef.current = initial;
    previousRawRef.current = initial;
    setHistory([]);
    setFuture([]);
    setLastAction(null);
    setTab('raw');
    setDraftNotice(Boolean(draft && draft.raw !== currentEntity.savedRaw));
    setAnimKey(null);
    setFrameNumber(1);
    rememberEntity(activeProject?.id ?? '', currentEntity.id);
    // Only reinitialise when the route points at a different entity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntity?.id]);

  const dirty = Boolean(currentEntity && raw !== currentEntity.savedRaw);

  useEffect(() => {
    if (rawBufferRef.current === previousRawRef.current) {
      rawBufferRef.current = raw;
      setRawBuffer(raw);
    }
    previousRawRef.current = raw;
  }, [raw]);

  const model = useMemo(() => {
    try {
      return parseModel(raw);
    } catch {
      return null;
    }
  }, [raw]);

  const findings = useMemo<ValidationFinding[]>(() => {
    if (!model) return [];
    return validateModel(model);
  }, [model]);

  const liveSummary = useMemo(
    () => (model ? summaryFromModel(model, findings) : null),
    [findings, model],
  );

  const selectedAnimation = model ? findAnimation(model, animKey) : undefined;
  const selectedFrame =
    selectedAnimation?.frames.find((frame) => frame.number === frameNumber) ??
    selectedAnimation?.frames[0];

  const commit = (next: string, action: string) => {
    if (!currentEntity || next === rawRef.current) return;
    setHistory((items) => [...items.slice(-59), rawRef.current]);
    setFuture([]);
    setLastAction(action);
    setRaw(next);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture((items) => [rawRef.current, ...items].slice(0, 60));
    setHistory((items) => items.slice(0, -1));
    setRaw(previous);
    setLastAction('Undo');
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((items) => [...items.slice(-59), rawRef.current]);
    setFuture((items) => items.slice(1));
    setRaw(next);
    setLastAction('Redo');
  };

  useEffect(() => {
    if (!currentEntity || loadedId !== currentEntity.id) return;
    if (raw !== currentEntity.savedRaw) saveDraft(activeProject?.id ?? '', currentEntity.id, raw);
  }, [raw, currentEntity, loadedId, activeProject?.id, saveDraft]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleSave = async () => {
    if (!activeProject || !currentEntity || !dirty || saving) return;
    setSaving(true);
    try {
      const saved = await saveEntity(activeProject.id, currentEntity.id, raw);
      if (saved) {
        setDraftNotice(false);
        setLastAction('Saved');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
        return;
      }
      if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!activeProject) {
    return (
      <EmptyState
        icon={FileCode2}
        title="No active project"
        description="Choose a project before opening the stat editor."
        actions={<Button onClick={() => navigate('projects')}>Open projects</Button>}
      />
    );
  }

  if (!currentEntity) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Entity not found"
        description="This model is no longer in the active project, or the link is out of date."
        actions={<Button onClick={() => navigate('entities')}>Back to entities</Button>}
      />
    );
  }

  if (loadedId !== currentEntity.id) {
    return (
      <div className="loading-screen" style={{ minHeight: 320 }}>
        <div className="spinner" />
        Loading model…
      </div>
    );
  }

  const discardDraft = async () => {
    await clearDraft(activeProject.id, currentEntity.id);
    setDraftNotice(false);
    setRaw(currentEntity.savedRaw);
    setHistory([]);
    setFuture([]);
    setLastAction('Draft discarded');
  };

  const revert = () => {
    commit(currentEntity.savedRaw, 'Reverted to saved version');
    setDraftNotice(false);
    void clearDraft(activeProject.id, currentEntity.id);
    setRevertOpen(false);
  };

  const download = () => {
    downloadText(currentEntity.fileName, raw);
    notify(`Downloaded ${currentEntity.fileName}.`, 'success');
  };

  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const infoCount = findings.filter((finding) => finding.severity === 'info').length;
  const tabs: TabItem[] = [
    { id: 'raw', label: 'Code', icon: Code2 },
    { id: 'frames', label: 'Frames', icon: FileCode2, count: model?.stats.totalFrames },
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'stats', label: 'Statistics', icon: BarChart3 },
    { id: 'header', label: 'Header lines', icon: Code2, count: model?.header.length },
    { id: 'history', label: 'History', icon: History, count: currentEntity.revisions.length },
    {
      id: 'validation',
      label: 'Validation',
      icon: ShieldCheck,
      count: errorCount + warningCount,
    },
  ];

  return (
    <>
      <header className="editor-header">
        <div style={{ minWidth: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('entities')} style={{ marginBottom: 6 }}>
            <ArrowLeft /> Entities
          </button>
          <div className="editor-title-row">
            <h1 className="editor-title">{liveSummary?.name ?? currentEntity.fileName}</h1>
            <Badge tone={typeTone(liveSummary?.type)}>{typeLabel(liveSummary?.type)}</Badge>
            {liveSummary?.subtype ? <Badge tone="neutral">{liveSummary.subtype}</Badge> : null}
            <Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unsaved changes' : 'Saved'}</Badge>
          </div>
          <div className="editor-file">{currentEntity.path}</div>
        </div>
        <div className="editor-actions">
          <IconButton icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={history.length === 0} />
          <IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0} />
          <Button icon={RotateCcw} onClick={() => setRevertOpen(true)} disabled={!dirty}>
            Revert
          </Button>
          <Button icon={Download} onClick={download}>
            Download .txt
          </Button>
          <Button variant="primary" icon={Save} onClick={() => void handleSave()} disabled={!dirty || saving} loading={saving}>
            Save
          </Button>
        </div>
      </header>

      {draftNotice ? (
        <div className="alert-banner" role="status">
          <Clock size={15} />
          <div>
            <strong>Recovered an autosaved draft.</strong> It differs from the last saved version. Keep
            editing and save it, or discard the draft to return to the saved file.
          </div>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <Button size="sm" onClick={() => void discardDraft()}>
              Discard draft
            </Button>
          </div>
        </div>
      ) : null}

      <div className="editor-bar">
        <span className={classNames('dirty-dot', !dirty && 'clean')} />
        <span className="small">
          {dirty ? 'Editing local draft' : 'All changes saved'}
          {lastAction ? <span className="muted"> · {lastAction}</span> : null}
        </span>
        <span className="spacer" />
        <span className="small muted mono">
          {model?.stats.totalFrames ?? 0} frames · {model?.animations.length ?? 0} animations ·{' '}
          {model?.header.length ?? 0} header lines
        </span>          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => navigate(`compare?mode=entities&a=${currentEntity.id}`)}>
          Compare
        </Button>
      </div>

      <Tabs items={tabs} value={tab} onChange={(value) => setTab(value as EditorTab)} ariaLabel="Editor sections" />

      <div style={{ marginTop: 16 }}>
        {!model ? (
          <EmptyState
            icon={AlertCircle}
            title="The model could not be parsed"
            description="Switch to Raw text to fix the syntax, or revert to the saved version."
            actions={
              <>
                <Button onClick={() => setTab('raw')}>Open raw editor</Button>
                <Button onClick={() => setRevertOpen(true)}>Revert</Button>
              </>
            }
          />
        ) : (
          <>
            {tab === 'overview' ? (
              <OverviewTab
                model={model}
                raw={raw}
                commit={commit}
                summary={liveSummary}
                errors={errorCount}
                warnings={warningCount}
                onOpenHeader={() => setTab('header')}
              />
            ) : null}
            {tab === 'stats' ? <StatsTab model={model} /> : null}
            {tab === 'frames' ? (
              <FramesTab
                model={model}
                projectId={activeProject.id}
                raw={raw}
                commit={commit}
                selectedAnimation={selectedAnimation}
                selectedFrame={selectedFrame}
                onSelectAnimation={(animation) => {
                  setAnimKey({ name: animation.name, occurrence: occurrenceFor(model, animation.name, animation.line) });
                  setFrameNumber(1);
                }}
                onSelectFrame={(frame) => setFrameNumber(frame.number)}
                onAddFrame={(image) => {
                  if (!selectedFrame) return;
                  setNewFramePath(image);
                  setAddFrameOpen(true);
                }}
              />
            ) : null}
            {tab === 'header' ? <HeaderLinesTab model={model} raw={raw} commit={commit} /> : null}
            {tab === 'raw' ? (
              <RawTab
                raw={raw}
                buffer={rawBuffer}
                setBuffer={(value) => {
                  rawBufferRef.current = value;
                  setRawBuffer(value);
                }}
                commit={commit}
                fileName={currentEntity.fileName}
              />
            ) : null}
            {tab === 'history' ? (
              <HistoryTab
                entity={currentEntity}
                model={model}
                raw={raw}
                commit={commit}
              />
            ) : null}
            {tab === 'validation' ? (
              <ValidationTab
                findings={findings}
                model={model}
                errors={errorCount}
                warnings={warningCount}
                infos={infoCount}
              />
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={revertOpen}
        onClose={() => setRevertOpen(false)}
        title="Revert to the saved version?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevertOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={revert}>Revert changes</Button>
          </>
        }
      >
        <p className="muted small">
          This replaces the current editor content with the last saved version. You can undo the revert
          with Ctrl+Z, and the saved file itself is not changed until you save again.
        </p>
      </Modal>

      <Modal
        open={addFrameOpen}
        onClose={() => setAddFrameOpen(false)}
        title="Add frame after the selected frame"
        subtitle="The new frame inherits the active delay, offset, body box, attack box, and movement."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddFrameOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!newFramePath.trim()}
              onClick={() => {
                if (!selectedFrame) return;
                const line = selectedFrame.line;
                const next = addFrameAfter(raw, line, newFramePath.trim());
                commit(next, 'Added frame');
                setAddFrameOpen(false);
                setFrameNumber(selectedFrame.number + 1);
              }}
            >
              Add frame
            </Button>
          </>
        }
      >
        <Field label="Frame image path" htmlFor="new-frame-path" hint="Relative to the OpenBOR data directory, or none.">
          <input
            id="new-frame-path"
            className="input mono"
            value={newFramePath}
            onChange={(event) => setNewFramePath(event.target.value)}
            placeholder="data/chars/player/idle1.gif"
          />
        </Field>
        <div className="small muted">
          Frame-level overrides are preserved. Use the raw editor for structural changes such as removing
          an animation block.
        </div>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function OverviewTab({
  model,
  raw,
  commit,
  summary,
  errors,
  warnings,
  onOpenHeader,
}: {
  model: ParsedModel;
  raw: string;
  commit: (next: string, action: string) => void;
  summary: ReturnType<typeof summaryFromModel> | null;
  errors: number;
  warnings: number;
  onOpenHeader: () => void;
}) {
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Identity: true,
    Combat: true,
    Movement: true,
  });
  const [showAll, setShowAll] = useState(false);
  const term = search.trim().toLowerCase();
  const knownKeys = useMemo(() => new Set(FIELD_BY_KEY.keys()), []);
  const unknownHeader = model.header.filter((entry) => !knownKeys.has(entry.key));
  const sections = FIELD_SECTIONS.map((section) => ({
    section,
    fields: (FIELD_BY_KEY ? [...FIELD_BY_KEY.values()] : []).filter(
      (field) =>
        field.section === section &&
        (!term ||
          field.key.toLowerCase().includes(term) ||
          field.label.toLowerCase().includes(term) ||
          field.summary.toLowerCase().includes(term)),
    ),
  })).filter((entry) => entry.fields.length > 0);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid grid-4 stats-row">
        <div className="stat-card">
          <div className="stat-label"><Zap /> Health</div>
          <div className="stat-value accent">{formatNumber(summary?.health, 0)}</div>
          <div className="stat-foot">{summary?.type ? `${typeLabel(summary.type)} model` : 'No type declared'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><BarChart3 /> Animations</div>
          <div className="stat-value">{formatNumber(model.animations.length)}</div>
          <div className="stat-foot">{formatNumber(model.stats.totalFrames)} frames · {round(model.stats.durationSeconds)}s</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Zap /> Attack damage</div>
          <div className="stat-value">{formatNumber(model.stats.totalDamage)}</div>
          <div className="stat-foot">{formatNumber(model.stats.totalHits)} separate hits</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><ShieldCheck /> Validation</div>
          <div className={classNames('stat-value', errors ? 'danger' : undefined)}>{errors} / {warnings}</div>
          <div className="stat-foot">Errors / warnings</div>
        </div>
      </div>

      <Card>
        <div className="card-body col" style={{ gap: 10 }}>
          <div className="row-between wrap">
            <div>
              <div className="section-title" style={{ marginBottom: 2 }}>Structured header fields</div>
              <div className="small muted">
                Values are patched into the original text. Unlisted commands stay untouched and are editable
                in Header lines or Raw text.
              </div>
            </div>
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="Filter header fields…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Filter header fields"
            />
          </div>
          <div className="row wrap">
            <Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Collapse optional sections' : 'Expand all field sections'}
            </Button>
            <span className="small muted">
              {model.header.length} lines in header · {unknownHeader.length} undocumented
            </span>
            <span className="spacer" />
            {unknownHeader.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={onOpenHeader}>
                Review custom fields
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {sections.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No fields match"
          description="Try a different field name, or use the Header lines tab to edit a custom command."
        />
      ) : null}

      {sections.map(({ section, fields }) => {
        const open = showAll || Boolean(term) || openSections[section];
        return (
          <section className="section-card" key={section}>
            <button
              type="button"
              className="section-card-head"
              style={{ width: '100%', border: 0, textAlign: 'left' }}
              aria-expanded={open}
              onClick={() => setOpenSections((current) => ({ ...current, [section]: !current[section] }))}
            >
              {open ? <ChevronDown /> : <ChevronRight />}
              <h3>{section}</h3>
              <span className="section-desc">{fields.length} fields</span>
            </button>
            {open ? (
              <div className="section-card-body">
                <div className="field-grid">
                  {fields.map((field) => (
                    <HeaderFieldCard
                      key={field.key}
                      spec={field}
                      model={model}
                      raw={raw}
                      commit={commit}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function HeaderFieldCard({
  spec,
  model,
  raw,
  commit,
}: {
  spec: HeaderFieldSpec;
  model: ParsedModel;
  raw: string;
  commit: (next: string, action: string) => void;
}) {
  const entries = model.header.filter((entry) => entry.key === spec.key);
  const primary = entries[0];
  const hasValue = entries.length > 0;
  const required = spec.key === 'name' || spec.key === 'type';
  const templateArgs = tokenizeLine(spec.defaultValue ?? '');

  const add = () => {
    if (templateArgs.length === 0) return;
    commit(setHeaderField(raw, spec.key, templateArgs), `Added ${spec.key}`);
  };

  const reset = () => {
    commit(setHeaderField(raw, spec.key, null), `Reset ${spec.key}`);
  };

  const setArg = (index: number, value: string) => {
    if (required && value.trim() === '') return;
    const current = [...(primary?.args ?? templateArgs)];
    while (current.length <= index) {
      const argSpec = spec.args[current.length];
      current.push(argSpec?.kind === 'text' ? '' : argSpec?.defaultValue ?? '0');
    }
    current[index] = value;
    while (current.length > 1 && current[current.length - 1] === '') current.pop();
    const allEmpty = current.every((item) => item === '');
    if (allEmpty && !required) {
      commit(setHeaderField(raw, spec.key, null), `Cleared ${spec.key}`);
      return;
    }
    commit(setHeaderField(raw, spec.key, current), `Changed ${spec.key}`);
  };

  if (spec.repeatable) {
    return (
      <div className={classNames('field-card', entries.length > 0 && 'has-value')}>
        <div className="field-card-head">
          <div className="field-card-title">
            <strong>{spec.label}</strong>
            <span>{spec.key} · repeatable</span>
          </div>
          <Badge tone={entries.length > 0 ? 'success' : 'neutral'}>{entries.length}</Badge>
        </div>
        <span className="summary">{spec.summary}</span>
        {entries.length === 0 ? (
          <div className="row-between">
            <span className="field-default">
              {spec.engineDefault !== undefined ? `Engine default: ${spec.engineDefault}` : 'Not present'}
            </span>
            <Button size="sm" icon={Plus} onClick={add} disabled={templateArgs.length === 0}>
              Add
            </Button>
          </div>
        ) : (
          <div className="repeatable-list">
            {entries.map((entry) => (
              <RepeatableEntry
                key={`${entry.line}-${entry.raw}`}
                entry={entry}
                raw={raw}
                commit={commit}
              />
            ))}
            <div className="row-between">
              <span className="field-default">
                {spec.engineDefault !== undefined ? `Engine default: ${spec.engineDefault}` : `${entries.length} line(s)`}
              </span>
              <div className="row" style={{ gap: 4 }}>
                <Button size="sm" variant="ghost" icon={Plus} onClick={add} disabled={templateArgs.length === 0}>
                  Add line
                </Button>
                <Button size="sm" variant="ghost" onClick={reset} title="Remove all occurrences">
                  Remove all
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={classNames('field-card', hasValue && 'has-value')}>
      <div className="field-card-head">
        <div className="field-card-title">
          <strong>{spec.label}</strong>
          <span>
            {spec.key}
            {primary ? ` · line ${primary.line + 1}` : ''}
          </span>
        </div>
        <div className="row" style={{ gap: 3 }}>
          {required ? <Badge tone="warning">required</Badge> : null}
          <Badge tone={hasValue ? 'success' : 'neutral'}>{hasValue ? 'set' : 'default'}</Badge>
        </div>
      </div>
      <span className="summary">{spec.summary}</span>
      {hasValue ? (
        <>
          <div className="field-args">
            {spec.args.map((arg, index) => {
              const value = primary.args[index] ?? arg.defaultValue ?? '';
              const id = `${spec.key}-${index}-${primary.line}`;
              return (
                <label className="field" key={arg.name} htmlFor={id}>
                  <span className="field-arg-label">{arg.label ?? arg.name}</span>
                  {arg.options ? (
                    <select
                      id={id}
                      className="input sm"
                      value={value}
                      onChange={(event) => setArg(index, event.target.value)}
                    >
                      <option value="">—</option>
                      {arg.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                      {value && !arg.options.includes(value) ? <option value={value}>{value} (custom)</option> : null}
                    </select>
                  ) : (
                    <CommitInput
                      id={id}
                      value={value}
                      onCommit={(next) => setArg(index, next)}
                      numeric={arg.kind === 'integer' || arg.kind === 'float'}
                      placeholder={arg.optional ? 'optional' : ''}
                    />
                  )}
                </label>
              );
            })}
          </div>
          <div className="field-actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              disabled={required}
              title={
                required
                  ? 'Required fields cannot be removed'
                  : spec.engineDefault !== undefined
                    ? `Remove the line so the engine default (${spec.engineDefault}) applies`
                    : 'Remove this line from the file'
              }
            >
              {spec.engineDefault !== undefined ? 'Reset to engine default' : 'Remove field'}
            </Button>
            {entries.length > 1 ? (
              <span className="field-default">{entries.length - 1} duplicate occurrence(s)</span>
            ) : null}
          </div>
        </>
      ) : (
        <div className="row-between">
          <span className="field-default">
            {spec.engineDefault !== undefined
              ? `Engine default: ${spec.engineDefault}`
              : templateArgs.length > 0
                ? `Not set · template: ${spec.defaultValue}`
                : 'Not set · add a value in Header lines'}
          </span>
          {templateArgs.length > 0 ? (
            <Button size="sm" icon={Plus} onClick={add}>
              Add field
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RepeatableEntry({
  entry,
  raw,
  commit,
}: {
  entry: ParsedModel['header'][number];
  raw: string;
  commit: (next: string, action: string) => void;
}) {
  return (
    <div className="repeatable-item">
      <span className="mono" title={entry.raw}>
        {entry.args.join(' ') || '(empty)'}
      </span>
      <IconButton
        icon={Trash2}
        label={`Remove ${entry.key} line`}
        size="sm"
        onClick={() => commit(removeHeaderLine(raw, entry.line), `Removed ${entry.key} line`)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

function StatsTab({ model }: { model: ParsedModel }) {
  const stats = model.stats;
  const animationBars = [...model.animations]
    .filter((animation) => animation.totalDamage > 0)
    .sort((a, b) => b.totalDamage - a.totalDamage)
    .slice(0, 10)
    .map((animation) => ({ label: animation.name, value: animation.totalDamage }));
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid grid-4 stats-row">
        <div className="stat-card">
          <div className="stat-label"><FileCode2 /> Frames</div>
          <div className="stat-value">{formatNumber(stats.totalFrames)}</div>
          <div className="stat-foot">All animation blocks</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Clock /> Total delay</div>
          <div className="stat-value">{formatNumber(stats.totalDelay)}</div>
          <div className="stat-foot">{round(stats.durationSeconds)} seconds</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Zap /> Damage</div>
          <div className="stat-value accent">{formatNumber(stats.totalDamage)}</div>
          <div className="stat-foot">{formatNumber(stats.totalHits)} separate hits</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><BarChart3 /> Max hit</div>
          <div className="stat-value">{formatNumber(stats.maxHit)}</div>
          <div className="stat-foot">{formatNumber(stats.attackFrames)} frames with an active attack box</div>
        </div>
      </div>
      <div className="grid grid-main">
        <Card>
          <div className="card-head">
            <div>
              <h3>Animation statistics</h3>
              <div className="sub">Per-block totals from the parsed model text</div>
            </div>
            <Badge tone="neutral">{model.animations.length} blocks</Badge>
          </div>
          <div className="table-wrap" style={{ maxHeight: 560 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Animation</th>
                  <th className="num">Frames</th>
                  <th className="num">Delay</th>
                  <th className="num">Seconds</th>
                  <th className="num">Damage</th>
                  <th className="num">Hits</th>
                  <th className="num">Max hit</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {model.animations.map((animation) => (
                  <tr key={`${animation.name}-${animation.line}`}>
                    <td>
                      <div className="row-with-meta">
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text)' }}>{animation.name || '(unnamed)'}</span>
                        <span className="meta">line {animation.line + 1}</span>
                      </div>
                    </td>
                    <td className="num">{animation.totalFrames}</td>
                    <td className="num">{animation.totalDelay}</td>
                    <td className="num">{round(animation.durationSeconds)}</td>
                    <td className="num">{animation.totalDamage}</td>
                    <td className="num">{animation.totalHits}</td>
                    <td className="num">{animation.maxHit}</td>
                    <td>
                      <div className="row" style={{ gap: 3 }}>
                        {animation.hasScript ? <Badge tone="info">script</Badge> : null}
                        {animation.duplicate ? <Badge tone="warning">duplicate</Badge> : null}
                        {animation.loop ? <Badge tone="neutral">loop</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="col" style={{ gap: 14 }}>
          <Card>
            <div className="card-head">
              <h3>Damage by animation</h3>
          </div>
            <div className="card-body">
              {animationBars.length ? (
                <MiniBars items={animationBars} />
              ) : (
                <div className="muted small">No animation contains an attack box with positive damage.</div>
              )}
            </div>
          </Card>
          <Card>
            <div className="card-body col small" style={{ gap: 7 }}>
              <strong style={{ color: 'var(--text)' }}>How damage totals are counted</strong>
              <span className="muted">
                OpenBOR Stats adds the damage of each contiguous attack window once. If an attack box
                persists across several frames, it is counted as one activation, matching the original
                application's separate-hit calculation.
              </span>
              <span className="muted">
                Delay totals are the sum of effective per-frame delays; animation duration assumes the
                standard centisecond delay unit.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniBars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label" title={item.label}>{item.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </span>
          <span className="bar-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Frames                                                                     */
/* -------------------------------------------------------------------------- */

function FramesTab({
  model,
  projectId,
  raw,
  commit,
  selectedAnimation,
  selectedFrame,
  onSelectAnimation,
  onSelectFrame,
  onAddFrame,
}: {
  model: ParsedModel;
  projectId: string;
  raw: string;
  commit: (next: string, action: string) => void;
  selectedAnimation: ModelAnimation | undefined;
  selectedFrame: ModelFrame | undefined;
  onSelectAnimation: (animation: ModelAnimation) => void;
  onSelectFrame: (frame: ModelFrame) => void;
  onAddFrame: (image: string) => void;
}) {
  if (model.animations.length === 0) {
    return (
      <EmptyState
        icon={FileCode2}
        title="No animation blocks"
        description="Add an animation in the raw editor, starting with a line such as anim idle, followed by frame commands."
      />
    );
  }
  return (
    <div className="frame-workspace">
      <aside className="anim-pane" aria-label="Animations">
        <div className="anim-pane-head">Animations · {model.animations.length}</div>
        <div className="anim-list">
          {model.animations.map((animation) => (
            <button
              key={`${animation.name}-${animation.line}`}
              type="button"
              className={classNames(
                'anim-item',
                animation===selectedAnimation && 'active',
                animation.hasScript && 'scripted',
              )}
              onClick={() => onSelectAnimation(animation)}
              title={`Line ${animation.line + 1}`}
            >
              <span className="anim-name">{animation.name || '(unnamed)'}</span>
              <span className="anim-meta">
                <span>{animation.totalFrames}f</span>
                <span>{animation.totalDamage}dmg</span>
                {animation.duplicate ? <span className="text-warning">dup</span> : null}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="frame-pane">
        <div className="frame-pane-head">
          <div>
            <h3>{selectedAnimation?.name || '(unnamed animation)'}</h3>
            <div className="meta">
              line {(selectedAnimation?.line ?? 0) + 1} · {selectedAnimation?.totalFrames ?? 0} frames ·{' '}
              {selectedAnimation?.totalDamage ?? 0} damage · {selectedAnimation?.totalHits ?? 0} hits
            </div>
          </div>
          <div className="row" style={{ gap: 5 }}>
            {selectedAnimation?.hasScript ? <Badge tone="info">script</Badge> : null}
            <Button
              size="sm"
              icon={Plus}
              disabled={!selectedFrame}
              onClick={() => onAddFrame(selectedFrame?.image ?? '')}
            >
              Add frame
            </Button>
          </div>
        </div>
        {selectedFrame && selectedAnimation ? (
          <SpritePreview
            projectId={projectId}
            raw={raw}
            commit={commit}
            animation={selectedAnimation}
            frame={selectedFrame}
            onSelectFrame={onSelectFrame}
          />
        ) : null}
        <div className="frame-table-wrap">
          <table className="frame-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Image</th>
                <th className="num">Delay</th>
                <th>Offset</th>
                <th>Body box</th>
                <th>Attack</th>
                <th>Move</th>
              </tr>
            </thead>
            <tbody>
              {selectedAnimation?.frames.map((frame) => (
                <tr
                  key={frame.line}
                  className={frame.number === selectedFrame?.number ? 'selected' : ''}
                  onClick={() => onSelectFrame(frame)}
                >
                  <td>{frame.number}</td>
                  <td className="frame-img" title={frame.image ?? 'none'}>
                    {frame.image ? basename(frame.image) : 'none'}
                  </td>
                  <td className="num">{frame.delay}</td>
                  <td>{frame.offset ? `${frame.offset[0]}, ${frame.offset[1]}` : '—'}</td>
                  <td>{frame.bbox ? `${frame.bbox[2]}×${frame.bbox[3]}` : '—'}</td>
                  <td>
                    {frame.attack ? (
                      <span className={frame.attack.damage > 0 ? 'text-accent' : 'muted'}>
                        {frame.attack.damage}dmg
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {frame.move.some((value) => value !== 0)
                      ? `${frame.move[0]}, ${frame.move[1]}, ${frame.move[2]}`
                      : '—'}
                  </td>
                </tr>
              ))}
              {selectedAnimation?.frames.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No frames in this animation. Use the raw editor to add the first frame.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="frame-legend" style={{ padding: '8px 12px', borderTop: '1px solid var(--border-soft)' }}>
          <span>effective value</span>
          <span>Values are inherited across frames until an override is set.</span>
        </div>
      </section>
      <aside className="inspector" aria-label="Frame inspector">
        {selectedFrame && selectedAnimation ? (
          <FrameInspector
            raw={raw}
            commit={commit}
            animation={selectedAnimation}
            frame={selectedFrame}
          />
        ) : (
          <div className="muted small">Select an animation with at least one frame.</div>
        )}
      </aside>
    </div>
  );
}

function FrameInspector({
  raw,
  commit,
  animation,
  frame,
}: {
  raw: string;
  commit: (next: string, action: string) => void;
  animation: ModelAnimation;
  frame: ModelFrame;
}) {
  const hasOffset = frame.commands.some((command) => command.key === 'offset');
  const hasBBox = frame.commands.some((command) => command.key === 'bbox' || command.key === 'bboxz');
  const attackCommand = [...frame.commands].reverse().find((command) => /^(attack\d{0,2}|blast|shock|burn|freeze|steal|itembox)$/.test(command.key));
  const hasAttackOverride = Boolean(attackCommand);
  const loop = animation.loop ?? [0, 0, 0];

  const setLoop = (index: number, value: string) => {
    const next = [...loop];
    next[index] = Number(value) || 0;
    commit(setAnimationLoop(raw, animation.line, next), 'Changed animation loop');
  };

  const setOffset = (index: number, value: string) => {
    const next: [number, number] = [...(frame.offset ?? [0, 0])];
    next[index] = Number(value) || 0;
    commit(setFrameProperty(raw, frame.line, 'offset', [String(next[0]), String(next[1])]), 'Changed frame offset');
  };

  const setBBox = (index: number, value: string) => {
    const current = frame.bbox ?? [0, 0, 0, 0, 0];
    const next = [...current];
    next[index] = Number(value) || 0;
    if (next.length === 4) next.push(0);
    commit(
      setFrameProperty(raw, frame.line, 'bbox', next.slice(0, 5).map(String)),
      'Changed body box',
    );
  };

  const addBBox = () => {
    commit(setFrameProperty(raw, frame.line, 'bbox', ['0', '0', '32', '72']), 'Added body box');
  };

  const removeBBox = () => {
    commit(setFrameProperty(raw, frame.line, 'bbox', ['none']), 'Removed body box');
  };

  const existingAttack: AttackBox =
    frame.attack ??
    {
      command: 'attack',
      kind: 'normal',
      x: 0,
      y: 0,
      width: 32,
      height: 24,
      damage: 10,
      secondary: 0,
      noBlock: 0,
      noFlash: 0,
      pause: 0,
      z: 0,
      rawArgs: [],
      line: frame.line,
      short: false,
    };

  const setAttackNumber = (key: keyof AttackBox, value: string) => {
    const next = { ...existingAttack, [key]: Number(value) || 0 } as AttackBox;
    commit(setFrameAttack(raw, frame.line, next, next.command), 'Changed attack box');
  };

  const setAttackKind = (kind: AttackBox['kind']) => {
    const command = kind === 'normal'
      ? existingAttack.command.startsWith('attack')
        ? existingAttack.command
        : 'attack'
      : kind;
    const next: AttackBox = { ...existingAttack, kind, command };
    commit(setFrameAttack(raw, frame.line, next, command), 'Changed attack type');
  };

  const addAttack = () => {
    commit(setFrameAttack(raw, frame.line, existingAttack, 'attack'), 'Added attack box');
  };

  const removeAttack = () => {
    commit(setFrameAttack(raw, frame.line, null), 'Disabled attack box');
  };

  return (
    <>
      <div className="row-between">
        <h3>Frame {frame.number}</h3>
        <span className="tiny muted mono">line {frame.line + 1}</span>
      </div>

      <div className="inspector-group">
        <div className="inspector-group-head">
          <strong>Animation</strong>
          <span className="tiny muted mono">line {animation.line + 1}</span>
        </div>
        <div className="property-row">
          <label>loop</label>
          <div className="row" style={{ gap: 4 }}>
            <CommitInput value={String(loop[0])} onCommit={(value) => setLoop(0, value)} numeric />
            <CommitInput value={String(loop[1])} onCommit={(value) => setLoop(1, value)} numeric />
            <CommitInput value={String(loop[2])} onCommit={(value) => setLoop(2, value)} numeric />
          </div>
        </div>
        <div className="property-row">
          <label>range</label>
          <span className="tiny muted mono">
            {animation.range ? `${animation.range[0]} … ${animation.range[1]}` : 'engine default'}
          </span>
        </div>
        <div className="property-row">
          <label>rangea</label>
          <span className="tiny muted mono">
            {animation.rangeA ? `${animation.rangeA[0]} … ${animation.rangeA[1]}` : 'engine default'}
          </span>
        </div>
      </div>

      <div className="inspector-group">
        <div className="inspector-group-head">
          <strong>Frame image</strong>
          <span className="tiny muted">{frame.image ? basename(frame.image) : 'none'}</span>
        </div>
        <CommitInput
          value={frame.image ?? ''}
          onCommit={(value) =>
            commit(setFrameImage(raw, frame.line, value), 'Changed frame image')
          }
          placeholder="none"
        />
      </div>

      <div className="inspector-group">
        <div className="inspector-group-head">
          <strong>Timing & movement</strong>
          <span className="tiny muted">{hasOffset ? 'frame override' : 'inherited'}</span>
        </div>
        <div className="property-row">
          <label>delay</label>
          <CommitInput
            value={String(frame.delay)}
            onCommit={(value) =>
              commit(setFrameProperty(raw, frame.line, 'delay', [value]), 'Changed frame delay')
            }
            numeric
          />
        </div>
        <div className="property-row">
          <label>offset x</label>
          <CommitInput value={String(frame.offset?.[0] ?? 0)} onCommit={(value) => setOffset(0, value)} numeric />
        </div>
        <div className="property-row">
          <label>offset y</label>
          <CommitInput value={String(frame.offset?.[1] ?? 0)} onCommit={(value) => setOffset(1, value)} numeric />
        </div>
        <div className="property-row">
          <label>move x</label>
          <CommitInput
            value={String(frame.move[0])}
            onCommit={(value) =>
              commit(setFrameProperty(raw, frame.line, 'move', [value]), 'Changed frame movement')
            }
            numeric
          />
        </div>
        <div className="property-row">
          <label>move z</label>
          <CommitInput
            value={String(frame.move[2])}
            onCommit={(value) =>
              commit(setFrameProperty(raw, frame.line, 'movez', [value]), 'Changed frame movement')
            }
            numeric
          />
        </div>
        <div className="property-row">
          <label>move a</label>
          <CommitInput
            value={String(frame.move[1])}
            onCommit={(value) =>
              commit(setFrameProperty(raw, frame.line, 'movea', [value]), 'Changed frame movement')
            }
            numeric
          />
        </div>
      </div>

      <div className="inspector-group">
        <div className="inspector-group-head">
          <strong>Body box</strong>
          <span className="tiny muted">{hasBBox ? 'frame override' : frame.bbox ? 'inherited' : 'not set'}</span>
        </div>
        {frame.bbox ? (
          <>
            {(['x', 'y', 'w', 'h', 'z'] as const).map((label, index) => (
              <div className="property-row" key={label}>
                <label>bbox {label}</label>
                <CommitInput
                  value={String(frame.bbox?.[index] ?? 0)}
                  onCommit={(value) => setBBox(index, value)}
                  numeric
                />
              </div>
            ))}
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" onClick={removeBBox}>Disable box</Button>
            </div>
          </>
        ) : (
          <Button size="sm" icon={Plus} onClick={addBBox}>Add body box</Button>
        )}
      </div>

      <div className="inspector-group">
        <div className="inspector-group-head">
          <strong>Attack box</strong>
          <span className="tiny muted">{hasAttackOverride ? 'frame override' : frame.attack ? 'inherited' : 'none'}</span>
        </div>
        {frame.attack ? (
          <>
            <div className="property-row">
              <label>type</label>
              <select
                className="select"
                value={frame.attack.kind}
                onChange={(event) => setAttackKind(event.target.value as AttackBox['kind'])}
              >
                <option value="normal">normal / attack</option>
                <option value="blast">blast</option>
                <option value="shock">shock</option>
                <option value="burn">burn</option>
                <option value="freeze">freeze</option>
                <option value="steal">steal</option>
              </select>
            </div>
            {(['x', 'y', 'width', 'height', 'damage'] as const).map((key) => (
              <div className="property-row" key={key}>
                <label>{key === 'width' ? 'w' : key === 'height' ? 'h' : key === 'damage' ? 'damage' : key}</label>
                <CommitInput
                  value={String(frame.attack?.[key] ?? 0)}
                  onCommit={(value) => setAttackNumber(key, value)}
                  numeric
                />
              </div>
            ))}
            <div className="property-row">
              <label>{frame.attack.kind === 'freeze' ? 'freeze' : 'drop'}</label>
              <CommitInput
                value={String(frame.attack.secondary)}
                onCommit={(value) => setAttackNumber('secondary', value)}
                numeric
              />
            </div>
            <div className="property-row">
              <label>z</label>
              <CommitInput
                value={String(frame.attack.z ?? 0)}
                onCommit={(value) => setAttackNumber('z', value)}
                numeric
              />
            </div>
            <div className="row wrap" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" onClick={removeAttack}>Disable box</Button>
              {attackCommand ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => commit(removeHeaderLine(raw, attackCommand.line), 'Removed attack override')}
                >
                  Remove override
                </Button>
              ) : null}
            </div>
            {frame.attack.short ? (
              <div className="tiny text-danger">This attack command has fewer than five numeric values.</div>
            ) : null}
          </>
        ) : (
          <Button size="sm" icon={Plus} onClick={addAttack}>Add attack box</Button>
        )}
      </div>

      <div className="small muted">
        Edits insert or update commands directly before this frame. Inherited values are not rewritten.
      </div>
      <span className="sr-only">Editing animation {animation.name} frame {frame.number}</span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

function HeaderLinesTab({
  model,
  raw,
  commit,
}: {
  model: ParsedModel;
  raw: string;
  commit: (next: string, action: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [customLine, setCustomLine] = useState('custom_command 1');
  const [addError, setAddError] = useState<string | null>(null);

  const addCustom = () => {
    const tokens = tokenizeLine(customLine.trim());
    if (tokens.length === 0) {
      setAddError('Enter a command and optional values.');
      return;
    }
    commit(addHeaderCommand(raw, tokens[0], tokens.slice(1)), `Added ${tokens[0]}`);
    setAddOpen(false);
    setAddError(null);
    setCustomLine('custom_command 1');
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <Card>
        <div className="card-head">
          <div>
            <h3>Header lines</h3>
            <div className="sub">
              Every command before the first animation block. Unknown commands are preserved and marked.
            </div>
          </div>
          <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
            Add custom line
          </Button>
        </div>
        <div className="table-wrap" style={{ maxHeight: 620 }}>
          <table className="table table-compact">
            <thead>
              <tr>
                <th className="num">Line</th>
                <th>Command</th>
                <th>Arguments</th>
                <th>Source</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {model.header.map((entry) => {
                const known = FIELD_BY_KEY.has(entry.key);
                return (
                  <tr key={`${entry.line}-${entry.key}`}>
                    <td className="num">{entry.line + 1}</td>
                    <td>
                      <span className={known ? 'text-accent mono' : 'text-warning mono'} style={{ fontSize: 11 }}>
                        {entry.key}
                      </span>
                      {!known ? <Badge tone="warning">unknown</Badge> : null}
                    </td>
                    <td style={{ minWidth: 240 }}>
                      <CommitInput
                        value={entry.args.join(' ')}
                        onCommit={(value) =>
                          commit(
                            setHeaderLineArgs(raw, entry.line, entry.key, tokenizeLine(value)),
                            `Edited ${entry.key}`,
                          )
                        }
                        placeholder="(no arguments)"
                      />
                    </td>
                    <td className="mono muted small" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.raw.trim()}
                    </td>
                    <td className="actions">
                      <IconButton
                        icon={Trash2}
                        label={`Remove ${entry.key} line`}
                        size="sm"
                        className="text-danger"
                        onClick={() => commit(removeHeaderLine(raw, entry.line), `Removed ${entry.key}`)}
                      />
                    </td>
                  </tr>
                );
              })}
              {model.header.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">No header commands before the first animation block.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="callout">
        <Info size={14} />
        <span>
          Removing a documented field restores the engine default. Removing a custom command may change
          engine behaviour, but the line only disappears after you save. You can undo the removal.
        </span>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a header line"
        subtitle="The line is inserted after the last header command, before the first animation."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={addCustom} disabled={!customLine.trim()}>Add line</Button>
          </>
        }
      >
        <Field
          label="Command line"
          htmlFor="custom-header-line"
          hint="Example: type enemy, or a custom command from your engine build."
          error={addError}
        >
          <input
            id="custom-header-line"
            className="input mono"
            value={customLine}
            onChange={(event) => setCustomLine(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addCustom();
            }}
          />
        </Field>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Raw text                                                                   */
/* -------------------------------------------------------------------------- */

function RawTab({
  raw,
  buffer,
  setBuffer,
  commit,
  fileName,
}: {
  raw: string;
  buffer: string;
  setBuffer: (value: string) => void;
  commit: (next: string, action: string) => void;
  fileName: string;
}) {
  const [copied, setCopied] = useState(false);
  const dirty = buffer !== raw;

  const preview = useMemo(() => {
    try {
      return { model: parseModel(buffer), error: null as string | null };
    } catch (error) {
      return { model: null, error: error instanceof Error ? error.message : 'Could not parse the text.' };
    }
  }, [buffer]);

  const apply = () => {
    if (!dirty) return;
    commit(buffer, 'Applied raw text changes');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buffer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="raw-editor">
      <div className="col" style={{ gap: 8 }}>
        <div className="row-between wrap">
          <div className="row" style={{ gap: 6 }}>
            <Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unapplied edits' : 'In sync'}</Badge>
            <span className="small muted">
              {preview.model
                ? `${preview.model.animations.length} animations · ${preview.model.header.length} header lines`
                : 'Parse error'}
            </span>
          </div>
          <div className="row" style={{ gap: 5 }}>
            <Button size="sm" icon={Copy} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Button>
            <Button size="sm" icon={Download} onClick={() => downloadText(fileName, buffer)}>Download</Button>
            <Button size="sm" variant="ghost" onClick={() => setBuffer(raw)} disabled={!dirty}>Discard</Button>
            <Button size="sm" variant="primary" onClick={apply} disabled={!dirty || !preview.model}>
              Apply changes
            </Button>
          </div>
        </div>
        <textarea
          className="raw-textarea"
          value={buffer}
          spellCheck={false}
          onChange={(event) => setBuffer(event.target.value)}
          aria-label="Raw OpenBOR model text"
        />
        <div className="row-between small muted">
          <span className="line-counts">
            <span>{buffer.split(/\r\n|\n|\r/).length} lines</span>
            <span>{buffer.length} characters</span>
            <span>{buffer.includes('\r\n') ? 'CRLF' : 'LF'} line endings</span>
          </span>
          <span>
            Apply is undoable. Edit carefully: scripts and unknown commands are preserved.
          </span>
        </div>
      </div>
      <aside className="raw-side">
        <Card>
          <div className="card-head"><h3>Live parse</h3></div>
          <div className="card-body col" style={{ gap: 8 }}>
            {preview.model ? (
              <>
                <div className="row-between small"><span className="muted">Name</span><span className="mono">{preview.model.name ?? '—'}</span></div>
                <div className="row-between small"><span className="muted">Type</span><span>{preview.model.type ?? '—'}</span></div>
                <div className="row-between small"><span className="muted">Animations</span><span className="mono">{preview.model.animations.length}</span></div>
                <div className="row-between small"><span className="muted">Frames</span><span className="mono">{preview.model.stats.totalFrames}</span></div>
                <div className="row-between small"><span className="muted">Attack windows</span><span className="mono">{preview.model.stats.totalHits}</span></div>
                <div className="row-between small"><span className="muted">Damage</span><span className="mono">{preview.model.stats.totalDamage}</span></div>
                {preview.model.issues.length > 0 ? (
                  <div className="divider" />
                ) : null}
                {preview.model.issues.slice(0, 4).map((issue, index) => (
                  <div className={`finding ${issue.severity}`} key={index}>
                    <span className="finding-icon">
                      {issue.severity === 'error' ? <AlertCircle size={13} /> : <AlertTriangle size={13} />}
                    </span>
                    <span className="finding-message">{issue.message}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-danger small">{preview.error}</div>
            )}
          </div>
        </Card>
        <div className="callout">
          <Info size={14} />
          <span>
            The raw editor is the escape hatch for unsupported commands, animation creation, and complex
            scripts. It edits the exact text that will be exported.
          </span>
        </div>
        <div className="small muted">
          Ctrl+S saves the applied text. Unapplied changes stay in this textarea and trigger a
          before-unload warning.
        </div>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

function HistoryTab({
  entity,
  model,
  raw,
  commit,
}: {
  entity: ProjectEntity;
  model: ParsedModel;
  raw: string;
  commit: (next: string, action: string) => void;
}) {
  const revisions = [...entity.revisions].sort((a, b) => b.savedAt - a.savedAt);
  const [selectedId, setSelectedId] = useState<string | null>(revisions[0]?.id ?? null);
  const selected = revisions.find((revision) => revision.id === selectedId) ?? revisions[0] ?? null;
  const comparison = useMemo(() => {
    if (!selected) return null;
    try {
      return compareModels(parseModel(selected.raw), model);
    } catch {
      return null;
    }
  }, [model, selected]);

  if (revisions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No saved revisions yet"
        description="The first revision is created when you import a model. Additional revisions are added each time you save."
      />
    );
  }

  return (
    <div className="grid-main">
      <Card>
        <div className="card-head">
          <div>
            <h3>Revision history</h3>
            <div className="sub">Each save keeps up to 25 snapshots in this browser</div>
          </div>
          <Badge tone={raw === entity.savedRaw ? 'success' : 'warning'}>
            {raw === entity.savedRaw ? 'Saved state' : 'Unsaved edits'}
          </Badge>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Revision</th>
                <th>Saved</th>
                <th className="num">Frames</th>
                <th className="num">Damage</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => (
                <tr
                  key={revision.id}
                  className={revision.id === selected?.id ? 'selected' : ''}
                  onClick={() => setSelectedId(revision.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="row-with-meta">
                      <span style={{ fontSize: 11.5 }}>{revision.label}</span>
                      <span className="meta">{revision.raw.length} chars</span>
                    </div>
                  </td>
                  <td className="small muted">{formatDate(revision.savedAt)}</td>
                  <td className="num">{revision.stats.totalFrames}</td>
                  <td className="num">{revision.stats.totalDamage}</td>
                  <td className="actions">
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          commit(revision.raw, `Loaded revision: ${revision.label}`);
                        }}
                      >
                        Load
                      </Button>
                      <IconButton
                        icon={Download}
                        label="Download revision"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          downloadText(entity.fileName.replace(/\.txt$/i, `-${revision.id.slice(0, 6)}.txt`), revision.raw);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="col" style={{ gap: 14 }}>
        <Card>
          <div className="card-head">
            <div>
              <h3>Compare with current</h3>
              <div className="sub">{selected?.label ?? 'Select a revision'}</div>
            </div>
            <Badge tone={comparison?.changedHeaders.length ? 'warning' : 'success'}>
              {comparison ? `${comparison.changedHeaders.length} header changes` : '—'}
            </Badge>
          </div>
          <div className="card-body col" style={{ gap: 8 }}>
            {selected && comparison ? (
              <>
                <div className="row-between small"><span className="muted">Frames</span><span className="mono">{selected.stats.totalFrames} → {model.stats.totalFrames}</span></div>
                <div className="row-between small"><span className="muted">Delay</span><span className="mono">{selected.stats.totalDelay} → {model.stats.totalDelay}</span></div>
                <div className="row-between small"><span className="muted">Damage</span><span className="mono">{selected.stats.totalDamage} → {model.stats.totalDamage}</span></div>
                <div className="row-between small"><span className="muted">Hits</span><span className="mono">{selected.stats.totalHits} → {model.stats.totalHits}</span></div>
                <div className="divider" />
                {comparison.changedHeaders.length === 0 ? (
                  <div className="small muted">No header differences against the current editor text.</div>
                ) : (
                  comparison.changedHeaders.slice(0, 8).map((item) => (
                    <div className="row-between small" key={item.key}>
                      <span className="muted">{item.label}</span>
                      <span className="mono" style={{ fontSize: 10 }}>
                        {item.a ?? '—'} → {item.b ?? '—'}
                      </span>
                    </div>
                  ))
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate(`compare?mode=revisions&entity=${entity.id}&a=${selected.id}&b=current`)}
                  style={{ marginTop: 3 }}
                >
                  Open full comparison
                </Button>
              </>
            ) : (
              <div className="small muted">Select a revision to see differences.</div>
            )}
          </div>
        </Card>
        <div className="callout">
          <History size={14} />
          <span>
            Loading a revision only changes the editor buffer. Save to make it the current model and
            create a new revision.
          </span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function ValidationTab({
  findings,
  model,
  errors,
  warnings,
  infos,
}: {
  findings: ValidationFinding[];
  model: ParsedModel;
  errors: number;
  warnings: number;
  infos: number;
}) {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const filtered = findings.filter((finding) => filter === 'all' || finding.severity === filter);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row-between wrap">
        <div className="severity-summary">
          <Badge tone="error">{errors} errors</Badge>
          <Badge tone="warning">{warnings} warnings</Badge>
          <Badge tone="info">{infos} info</Badge>
        </div>
        <div className="segmented" role="group" aria-label="Filter validation findings">
          {(['all', 'error', 'warning', 'info'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={findings.length === 0 ? 'No validation issues' : 'No findings for this filter'}
          description={
            findings.length === 0
              ? 'The current editor text passes all documented checks. Exporting is still your responsibility to test in OpenBOR.'
              : 'Choose another severity to see the remaining findings.'
          }
        />
      ) : (
        <div className="col" style={{ gap: 7 }}>
          {filtered.map((finding, index) => (
            <div className={`finding ${finding.severity}`} key={`${finding.code}-${finding.line}-${index}`}>
              <span className="finding-icon">
                {finding.severity === 'error' ? (
                  <AlertCircle size={14} />
                ) : finding.severity === 'warning' ? (
                  <AlertTriangle size={14} />
                ) : (
                  <Info size={14} />
                )}
              </span>
              <div className="finding-body">
                <span className="finding-message">{finding.message}</span>
                <span className="finding-meta">
                  <span>{finding.code}</span>
                  {finding.line ? <span>line {finding.line}</span> : null}
                  {finding.animation ? <span>{finding.animation}</span> : null}
                  {finding.frame ? <span>frame {finding.frame}</span> : null}
                </span>
                {finding.detail ? <span className="finding-detail">{finding.detail}</span> : null}
                {finding.fix ? <span className="finding-fix">{finding.fix}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="callout">
        <Info size={14} />
        <span>
          These checks run against the current editor text, including unsaved changes. {model.animations.length}{' '}
          animation blocks and {model.header.length} header lines were analysed.
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

function CommitInput({
  value,
  onCommit,
  numeric,
  placeholder,
  id,
}: {
  value: string;
  onCommit: (value: string) => void;
  numeric?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      id={id}
      className="input sm mono"
      value={text}
      inputMode={numeric ? 'numeric' : undefined}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setText(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
