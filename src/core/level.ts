/**
 * OpenBOR level files are line-based text. This module reads the scene commands the engine and
 * the original Level Designer understand, and rewrites individual lines so that comments,
 * scripts and unknown commands are preserved exactly as the author wrote them.
 */

export const WALL_FIELDS = ['x', 'z', 'upperLeft', 'lowerLeft', 'upperRight', 'lowerRight', 'depth', 'alt'] as const;
export type WallField = (typeof WALL_FIELDS)[number];

export interface LevelPanel {
  /** Zero-based line index in the source text. */
  line: number;
  /** Letter used by `order`, assigned A, B, C… in file order. */
  letter: string;
  image: string;
  mode: string;
}

export interface LevelWall {
  line: number;
  kind: 'wall' | 'hole';
  /** Numeric values in the order of WALL_FIELDS; missing optional values are null. */
  values: Record<WallField, number | null>;
}

export interface LevelSpawn {
  /** Line of the `spawn <name>` header. */
  line: number;
  /** Line of the `coords` command, when present. */
  coordsLine: number | null;
  /** Line of the `at` command that ends the block, when present. */
  atLine: number | null;
  name: string;
  x: number | null;
  y: number | null;
  fall: number | null;
  at: number | null;
}

export interface LevelScene {
  music: { line: number; path: string; rest: string } | null;
  bossMusic: { line: number; path: string } | null;
  background: { line: number; path: string } | null;
  panels: LevelPanel[];
  /** Panel letters in the order they are drawn, from every `order` line joined together. */
  order: string;
  orderLines: number[];
  walls: LevelWall[];
  spawns: LevelSpawn[];
  lineCount: number;
}

function splitLines(text: string): string[] {
  return text.split('\n');
}

/** Removes a trailing carriage return and any `#` comment, then trims the line. */
function codeOf(raw: string): string {
  const withoutCr = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
  const hash = withoutCr.indexOf('#');
  return (hash === -1 ? withoutCr : withoutCr.slice(0, hash)).trim();
}

function tokensOf(raw: string): string[] {
  const code = codeOf(raw);
  return code === '' ? [] : code.split(/\s+/);
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const WALL_VALUE_TOKENS = 7;

export function parseLevel(text: string): LevelScene {
  const lines = splitLines(text);
  const scene: LevelScene = {
    music: null,
    bossMusic: null,
    background: null,
    panels: [],
    order: '',
    orderLines: [],
    walls: [],
    spawns: [],
    lineCount: lines.length,
  };

  let openSpawn: LevelSpawn | null = null;
  let panelIndex = 0;

  lines.forEach((raw, index) => {
    const tokens = tokensOf(raw);
    if (tokens.length === 0) return;
    const key = tokens[0].toLowerCase();

    if (key === 'music') {
      scene.music = { line: index, path: tokens[1] ?? '', rest: tokens.slice(2).join(' ') };
    } else if (key === 'bossmusic') {
      scene.bossMusic = { line: index, path: tokens[1] ?? '' };
    } else if (key === 'background') {
      scene.background = { line: index, path: tokens[1] ?? '' };
    } else if (key === 'panel') {
      const letter = String.fromCharCode(65 + (panelIndex % 26));
      panelIndex += 1;
      scene.panels.push({ line: index, letter, image: tokens[1] ?? '', mode: tokens[2] ?? 'none' });
    } else if (key === 'order') {
      scene.order += tokens.slice(1).join('');
      scene.orderLines.push(index);
    } else if (key === 'wall' || key === 'hole') {
      const numbers = tokens.slice(1, 1 + WALL_VALUE_TOKENS).map((value) => numberOrNull(value));
      const [x = null, z = null, upperLeft = null, lowerLeft = null, upperRight = null, lowerRight = null, depth = null] =
        numbers;
      const alt = numberOrNull(tokens[8]);
      scene.walls.push({
        line: index,
        kind: key === 'hole' ? 'hole' : 'wall',
        values: { x, z, upperLeft, lowerLeft, upperRight, lowerRight, depth, alt },
      });
    } else if (key === 'spawn') {
      openSpawn = {
        line: index,
        coordsLine: null,
        atLine: null,
        name: tokens[1] ?? '',
        x: null,
        y: null,
        fall: null,
        at: null,
      };
      scene.spawns.push(openSpawn);
    } else if (openSpawn && key === 'coords') {
      openSpawn.coordsLine = index;
      openSpawn.x = numberOrNull(tokens[1]);
      openSpawn.y = numberOrNull(tokens[2]);
      openSpawn.fall = numberOrNull(tokens[3]);
    } else if (openSpawn && key === 'at') {
      openSpawn.atLine = index;
      openSpawn.at = numberOrNull(tokens[1]);
      openSpawn = null;
    }
  });

  return scene;
}

/** Returns the text with one line replaced. The original line ending is kept. */
function replaceLine(text: string, line: number, content: string): string {
  const lines = splitLines(text);
  const original = lines[line] ?? '';
  const eol = original.endsWith('\r') ? '\r' : '';
  lines[line] = content + eol;
  return lines.join('\n');
}

/** Removes the given line indexes from the text. */
function removeLines(text: string, indexes: number[]): string {
  const drop = new Set(indexes);
  return splitLines(text)
    .filter((_, index) => !drop.has(index))
    .join('\n');
}

function eolOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function setMusic(text: string, path: string): string {
  const scene = parseLevel(text);
  if (scene.music) {
    const rest = scene.music.rest ? ` ${scene.music.rest}` : '';
    return replaceLine(text, scene.music.line, `music ${path}${rest}`);
  }
  return prependLine(text, `music ${path}`);
}

export function setBossMusic(text: string, path: string): string {
  const scene = parseLevel(text);
  if (scene.bossMusic) return replaceLine(text, scene.bossMusic.line, `bossmusic ${path}`);
  return prependLine(text, `bossmusic ${path}`);
}

export function setBackground(text: string, path: string): string {
  const scene = parseLevel(text);
  if (scene.background) return replaceLine(text, scene.background.line, `background ${path}`);
  return prependLine(text, `background ${path}`);
}

/** Puts a line at the top of the file (used for header commands that are missing). */
function prependLine(text: string, content: string): string {
  return `${content}${eolOf(text)}${text}`;
}

export function setPanelImage(text: string, panelLine: number, image: string, mode: string): string {
  const tokens = tokensOf(splitLines(text)[panelLine] ?? '');
  const rest = tokens.slice(3).join(' ');
  const tail = rest ? ` ${rest}` : '';
  return replaceLine(text, panelLine, `panel ${image} ${mode}${tail}`);
}

export function addPanel(text: string, image: string): string {
  return appendLine(text, `panel ${image} none`);
}

export function removePanel(text: string, panelLine: number): string {
  return removeLines(text, [panelLine]);
}

/** Appends a line at the end of the file, keeping the file's line ending style. */
function appendLine(text: string, content: string): string {
  const eol = eolOf(text);
  if (text === '') return content;
  return text.endsWith('\n') ? `${text}${content}${eol}` : `${text}${eol}${content}`;
}

/**
 * Sets the draw order. The first `order` line receives the whole sequence and any later
 * `order` lines are removed, so the order is never split across lines the engine would
 * concatenate in a different way.
 */
export function setOrder(text: string, order: string): string {
  const scene = parseLevel(text);
  const cleaned = order.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (scene.orderLines.length === 0) return appendLine(text, `order ${cleaned}`);
  const [first, ...rest] = scene.orderLines;
  const updated = replaceLine(text, first, `order ${cleaned}`);
  return removeLines(updated, rest);
}

export function setWallValues(text: string, line: number, values: Record<WallField, number | null>): string {
  const scene = parseLevel(text);
  const wall = scene.walls.find((entry) => entry.line === line);
  const keyword = wall?.kind ?? 'wall';
  const parts = [values.x, values.z, values.upperLeft, values.lowerLeft, values.upperRight, values.lowerRight, values.depth]
    .map((value) => (value === null ? '0' : String(value)));
  if (values.alt !== null) parts.push(String(values.alt));
  return replaceLine(text, line, `${keyword} ${parts.join(' ')}`);
}

export function addWall(text: string, x: number, z: number): string {
  return appendLine(text, `wall ${x} ${z} 0 0 0 0 0`);
}

export function removeWall(text: string, line: number): string {
  return removeLines(text, [line]);
}

export function setSpawnPosition(text: string, spawnLine: number, x: number, y: number): string {
  const scene = parseLevel(text);
  const spawn = scene.spawns.find((entry) => entry.line === spawnLine);
  if (!spawn) return text;
  const fall = spawn.fall !== null ? ` ${spawn.fall}` : '';
  if (spawn.coordsLine !== null) {
    return replaceLine(text, spawn.coordsLine, `coords ${x} ${y}${fall}`);
  }
  // Insert a coords line directly after the spawn header.
  const lines = splitLines(text);
  lines.splice(spawnLine + 1, 0, `coords ${x} ${y}`);
  return lines.join('\n');
}

export function setSpawnAt(text: string, spawnLine: number, at: number): string {
  const scene = parseLevel(text);
  const spawn = scene.spawns.find((entry) => entry.line === spawnLine);
  if (!spawn) return text;
  if (spawn.atLine !== null) return replaceLine(text, spawn.atLine, `at ${at}`);
  return appendLine(text, `at ${at}`);
}

export function removeSpawn(text: string, spawnLine: number): string {
  const scene = parseLevel(text);
  const spawn = scene.spawns.find((entry) => entry.line === spawnLine);
  if (!spawn) return text;
  const last = spawn.atLine ?? spawn.coordsLine ?? spawn.line;
  const indexes: number[] = [];
  for (let line = spawn.line; line <= last; line += 1) indexes.push(line);
  return removeLines(text, indexes);
}

export function addSpawn(text: string, name: string, x: number, y: number, at: number): string {
  const eol = eolOf(text);
  const block = [`spawn ${name}`, `coords ${x} ${y}`, `at ${at}`].join(eol);
  return text === '' ? block : appendLine(text, block);
}
