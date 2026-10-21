/**
 * Core data structures for OpenBOR model documents.
 *
 * A document keeps every source line so comments, indentation, unknown
 * commands, scripts, and original line endings survive export. Structured
 * views are derived from the same lines; edits are applied as targeted text
 * patches instead of re-serialising the whole file.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface SourceLine {
  index: number;
  /** Line content without its line ending. */
  text: string;
  /** `\n`, `\r\n`, or the empty string for the final line. */
  eol: string;
  /** Lower-cased command token, or null for blank/comment/script-only lines. */
  command: string | null;
  args: string[];
  /** Inline `#` comment, including the `#`, without surrounding whitespace. */
  comment: string | null;
  inScript: boolean;
  isBlank: boolean;
  isCommentOnly: boolean;
}

export interface HeaderCommand {
  key: string;
  args: string[];
  line: number;
  raw: string;
}

export interface AttackBox {
  command: string;
  kind: 'normal' | 'blast' | 'shock' | 'burn' | 'freeze' | 'steal' | 'itembox';
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  /** `drop`/knockdown for attack-style commands; freeze time for freeze; 0 for blast. */
  secondary: number;
  noBlock: number | null;
  noFlash: number | null;
  pause: number | null;
  z: number | null;
  rawArgs: string[];
  line: number;
  /** Present when the command parsed with fewer than five numeric arguments. */
  short: boolean;
}

export interface FrameState {
  delay: number;
  offset: [number, number] | null;
  bbox: [number, number, number, number, number?] | null;
  attack: AttackBox | null;
  move: [number, number, number];
}

export interface ModelFrame extends FrameState {
  number: number;
  line: number;
  /** First line of the command segment that configures this frame. */
  segmentStart: number;
  image: string | null;
  commands: HeaderCommand[];
  hasScript: boolean;
}

export interface AnimationStats {
  totalFrames: number;
  totalDelay: number;
  totalDamage: number;
  totalHits: number;
  maxHit: number;
  attackFrames: number;
  durationSeconds: number;
}

export interface ModelAnimation extends AnimationStats {
  name: string;
  line: number;
  endLine: number;
  loop: number[] | null;
  loopLine: number | null;
  range: [number, number] | null;
  rangeA: [number, number] | null;
  frames: ModelFrame[];
  hasScript: boolean;
  /** True when an earlier animation in the same file used this name. */
  duplicate: boolean;
}

export interface DocumentIssue {
  severity: Severity;
  message: string;
  line?: number;
}

export interface ParsedModel {
  text: string;
  bom: string;
  eol: string;
  finalNewline: boolean;
  lines: SourceLine[];
  header: HeaderCommand[];
  headerEnd: number;
  name: string | null;
  type: string | null;
  subtype: string | null;
  animations: ModelAnimation[];
  issues: DocumentIssue[];
  stats: AnimationStats;
}

export interface HeaderArgSpec {
  name: string;
  label?: string;
  kind: 'text' | 'integer' | 'float' | 'enum' | 'boolean';
  min?: number;
  max?: number;
  options?: string[];
  defaultValue?: string;
  optional?: boolean;
}

export interface HeaderFieldSpec {
  key: string;
  label: string;
  section: string;
  summary: string;
  args: HeaderArgSpec[];
  /** Template value written when the user adds the field. */
  defaultValue: string;
  /** Value the OpenBOR engine uses when the field is omitted, when documented. */
  engineDefault?: string;
  defaultRaw?: string;
  repeatable?: boolean;
  deprecated?: boolean;
  appliesTo?: string[];
  docsUrl?: string;
}

export interface FieldFlag {
  severity: Severity;
  message: string;
  suggestion?: string;
}

export interface ValidationFinding {
  severity: Severity;
  code: string;
  message: string;
  detail?: string;
  fix?: string;
  line?: number;
  animation?: string;
  frame?: number;
}

export interface ProjectEntity {
  id: string;
  fileName: string;
  /** Virtual folder path, e.g. `data/chars/knife/knife.txt`. */
  path: string;
  raw: string;
  /** Raw text at the last explicit save, used for diffs and reset. */
  savedRaw: string;
  createdAt: number;
  updatedAt: number;
  /** Last parse summary, cached for lists and dashboard counters. */
  summary: EntitySummary;
  revisions: EntityRevision[];
  notes?: string;
}

export interface EntityRevision {
  id: string;
  savedAt: number;
  label: string;
  raw: string;
  stats: AnimationStats;
}

export interface EntitySummary {
  name: string | null;
  type: string | null;
  subtype: string | null;
  animationCount: number;
  frameCount: number;
  totalDamage: number;
  health: number | null;
  speed: number | null;
  errors: number;
  warnings: number;
  parseError?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  entities: ProjectEntity[];
  /** Raw models.txt content when supplied or generated. */
  modelsFile: string | null;
  modelsFileName: string;
  /** Asset paths seen during import, used for reference validation. */
  assetPaths: string[];
  lastOpenedEntityId?: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  entityCount: number;
  issueCount: number;
  lastOpenedEntityId?: string;
}

export interface DraftRecord {
  entityId: string;
  projectId: string;
  raw: string;
  updatedAt: number;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  autosaveDrafts: boolean;
  showWelcome: boolean;
  editorFontSize: number;
}

export interface CompareMetric {
  label: string;
  a: number | null;
  b: number | null;
  unit?: string;
  higherIsBetter?: boolean;
}

export interface ParsedDocument {
  model: ParsedModel;
}
