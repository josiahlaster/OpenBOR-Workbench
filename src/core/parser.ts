import type {
  AnimationStats,
  AttackBox,
  DocumentIssue,
  FrameState,
  HeaderCommand,
  ModelAnimation,
  ModelFrame,
  ParsedModel,
  SourceLine,
} from './types';

const ATTACK_RE = /^(attack\d{0,2}|blast|shock|burn|freeze|steal|itembox)$/;
export interface TextLine {
  text: string;
  eol: string;
}

export function splitSourceText(text: string): {
  bom: string;
  lines: TextLine[];
  eol: string;
  finalNewline: boolean;
} {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = bom ? text.slice(1) : text;
  const firstCrlf = body.indexOf('\r\n');
  const firstLf = body.indexOf('\n');
  const eol = firstCrlf >= 0 ? '\r\n' : firstLf >= 0 ? '\n' : '\r';
  const lines: TextLine[] = [];
  let i = 0;
  while (i < body.length) {
    let j = i;
    while (j < body.length && body[j] !== '\n' && body[j] !== '\r') j += 1;
    let k = j;
    if (body[k] === '\r' && body[k + 1] === '\n') k += 2;
    else if (body[k] === '\r' || body[k] === '\n') k += 1;
    lines.push({ text: body.slice(i, j), eol: body.slice(j, k) });
    i = k;
  }
  if (lines.length === 0) lines.push({ text: '', eol: '' });
  const finalNewline = /(?:\r\n|\n|\r)$/.test(body);
  return { bom, lines, eol, finalNewline };
}

export function joinSourceText(
  lines: TextLine[],
  bom: string,
  finalNewline: boolean,
): string {
  const body = lines.map((line) => line.text + line.eol).join('');
  if (finalNewline && body.length > 0 && !/(?:\r\n|\n|\r)$/.test(body)) {
    return bom + body + (lines[0]?.eol || '\n');
  }
  return bom + body;
}

/** Split a command line into tokens. Supports quoted values and keeps empty quoted strings. */
export function tokenizeLine(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      started = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

export function splitInlineComment(input: string): { content: string; comment: string | null } {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#') {
      return { content: input.slice(0, i), comment: input.slice(i) };
    }
  }
  return { content: input, comment: null };
}

export function startsWithScriptDirective(trimmed: string): boolean {
  return /^@(?:script|end_script|cmd)(?:\s|$)/i.test(trimmed) || trimmed.toLowerCase() === '@script';
}

function isScriptOpen(trimmed: string): boolean {
  return /^@script(?:\s|$)/i.test(trimmed);
}

function isScriptClose(trimmed: string): boolean {
  return /^@end_script(?:\s|$)/i.test(trimmed);
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInt(value: string | undefined, fallback = 0): number {
  const parsed = parseNumber(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function parseAttack(command: string, args: string[], line: number): AttackBox | null {
  const lower = [command, ...args].join(' ').toLowerCase();
  const first = args[0]?.toLowerCase();
  if (args.length === 0 || first === 'none' || first === 'off' || lower === 'attack 0') {
    return null;
  }
  const numbers = args.map((arg) => parseNumber(arg));
  const [x, y, width, height, damage] = numbers;
  if (x === 0 && y === 0 && width === 0 && height === 0 && (damage ?? 0) === 0) {
    return null;
  }
  const kind: AttackBox['kind'] =
    command === 'blast'
      ? 'blast'
      : command === 'shock'
        ? 'shock'
        : command === 'burn'
          ? 'burn'
          : command === 'freeze'
            ? 'freeze'
            : command === 'steal'
              ? 'steal'
              : command === 'itembox'
                ? 'itembox'
                : 'normal';
  const int = (index: number): number | null => {
    const value = numbers[index];
    return value === null || value === undefined ? null : Math.trunc(value);
  };
  const zIndex = kind === 'blast' ? 8 : kind === 'freeze' ? 9 : 9;
  const noBlockIndex = kind === 'blast' ? 5 : kind === 'freeze' ? 6 : 6;
  const noFlashIndex = kind === 'blast' ? 6 : kind === 'freeze' ? 7 : 7;
  const pauseIndex = kind === 'blast' ? 7 : kind === 'freeze' ? 8 : 8;
  return {
    command,
    kind,
    x: int(0) ?? 0,
    y: int(1) ?? 0,
    width: int(2) ?? 0,
    height: int(3) ?? 0,
    damage: int(4) ?? 0,
    secondary: kind === 'freeze' ? (int(5) ?? 0) : kind === 'blast' ? 0 : (int(5) ?? 0),
    noBlock: int(noBlockIndex),
    noFlash: int(noFlashIndex),
    pause: int(pauseIndex),
    z: int(zIndex),
    rawArgs: args,
    line,
    short: args.length < 5 || numbers.slice(0, 5).some((value) => value === null),
  };
}

function emptyState(): FrameState {
  return {
    delay: 0,
    offset: null,
    bbox: null,
    attack: null,
    move: [0, 0, 0],
  };
}

function applyFrameCommand(
  state: FrameState,
  command: string,
  args: string[],
  line: number,
): boolean {
  if (ATTACK_RE.test(command)) {
    state.attack = parseAttack(command, args, line);
    return true;
  }
  switch (command) {
    case 'delay':
      state.delay = toInt(args[0], 0);
      return true;
    case 'offset': {
      const x = parseNumber(args[0]);
      const y = parseNumber(args[1]);
      if (x !== null && y !== null) state.offset = [Math.trunc(x), Math.trunc(y)];
      return true;
    }
    case 'bbox': {
      if (args[0]?.toLowerCase() === 'none') {
        state.bbox = null;
        return true;
      }
      const values = [0, 1, 2, 3, 4].map((i) => parseNumber(args[i]));
      if (values.slice(0, 4).every((value) => value !== null)) {
        state.bbox = [
          Math.trunc(values[0] as number),
          Math.trunc(values[1] as number),
          Math.trunc(values[2] as number),
          Math.trunc(values[3] as number),
          values[4] === null ? undefined : Math.trunc(values[4]),
        ];
      }
      return true;
    }
    case 'bboxz': {
      const z = parseNumber(args[0]);
      if (state.bbox && z !== null) state.bbox[4] = Math.trunc(z);
      return true;
    }
    case 'move':
      state.move[0] = toInt(args[0], 0);
      return true;
    case 'movez':
      state.move[2] = toInt(args[0], 0);
      return true;
    case 'movea':
      state.move[1] = toInt(args[0], 0);
      return true;
    case 'attackz':
    case 'hitz': {
      const z = parseNumber(args[0]);
      if (state.attack && z !== null) state.attack.z = Math.trunc(z);
      return true;
    }
    default:
      return false;
  }
}

const aggregateKeys: (keyof AnimationStats)[] = [
  'totalFrames',
  'totalDelay',
  'totalDamage',
  'totalHits',
  'maxHit',
  'attackFrames',
  'durationSeconds',
];

const LEVEL_HEADER_KEYS = ['bgspeed', 'background', 'bglayer', 'fglayer', 'loadingbg', 'set'];

/** Level/stage files share the txt format but describe scenes, not characters. */
export function isLevelModel(model: ParsedModel): boolean {
  const keys = new Set(model.header.map((entry) => entry.key));
  return (
    LEVEL_HEADER_KEYS.some((key) => keys.has(key)) || (keys.has('music') && keys.has('direction'))
  );
}

export function emptyStats(): AnimationStats {
  return {
    totalFrames: 0,
    totalDelay: 0,
    totalDamage: 0,
    totalHits: 0,
    maxHit: 0,
    attackFrames: 0,
    durationSeconds: 0,
  };
}

export function addStats(target: AnimationStats, source: AnimationStats): AnimationStats {
  for (const key of aggregateKeys) {
    if (key === 'maxHit') target.maxHit = Math.max(target.maxHit, source.maxHit);
    else target[key] += source[key];
  }
  return target;
}

export function parseModel(text: string): ParsedModel {
  const { bom, lines: rawLines, eol, finalNewline } = splitSourceText(text);
  const issues: DocumentIssue[] = [];
  const lines: SourceLine[] = [];
  let inScript = false;

  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index].text;
    const trimmed = raw.trim();
    const opened = isScriptOpen(trimmed);
    const closed = isScriptClose(trimmed);
    if (opened) inScript = true;
    const lineInScript = inScript;
    if (closed) inScript = false;

    let content = raw;
    let comment: string | null = null;
    if (!lineInScript) {
      const split = splitInlineComment(raw);
      content = split.content;
      comment = split.comment;
    }
    const contentTrimmed = content.trim();
    const tokens = contentTrimmed ? tokenizeLine(contentTrimmed) : [];
    const command = tokens[0]?.toLowerCase() ?? null;
    const isCommentOnly = contentTrimmed.startsWith('#');
    lines.push({
      index,
      text: raw,
      eol: rawLines[index].eol,
      command: lineInScript ? null : command,
      args: isCommentOnly ? [] : tokens.slice(1),
      comment,
      inScript: lineInScript,
      isBlank: trimmed === '',
      isCommentOnly,
    });
  }

  if (inScript) {
    issues.push({
      severity: 'warning',
      message: 'The file ends inside an @script block. The engine will also read the remainder as script.',
    });
  }

  const commandLines = lines.filter((line) => !line.inScript && line.command);
  const firstAnimLine = commandLines.find((line) => line.command === 'anim')?.index ?? -1;
  const headerEnd = firstAnimLine === -1 ? lines.length : firstAnimLine;
  const header: HeaderCommand[] = [];
  for (const line of commandLines) {
    if (line.index >= headerEnd) break;
    header.push({
      key: line.command as string,
      args: line.args,
      line: line.index,
      raw: line.text,
    });
  }

  const firstHeaderValue = (key: string): string | null => {
    const found = header.find((entry) => entry.key === key);
    return found?.args[0] ?? null;
  };

  const animations: ModelAnimation[] = [];
  const animationNameCounts = new Map<string, number>();
  const animLines = commandLines.filter((line) => line.command === 'anim');

  for (let animIndex = 0; animIndex < animLines.length; animIndex += 1) {
    const animLine = animLines[animIndex];
    const name = animLine.args[0] ?? '';
    const endLine =
      animIndex + 1 < animLines.length ? (animLines[animIndex + 1].index as number) : lines.length;
    const blockLines = lines.filter(
      (candidate) => candidate.index > animLine.index && candidate.index < endLine,
    );
    const blockCommands = blockLines.filter((candidate) => !candidate.inScript && candidate.command);
    const loopCommand = blockCommands.find((candidate) => candidate.command === 'loop');
    const loop = loopCommand
      ? [toInt(loopCommand.args[0], 0), toInt(loopCommand.args[1], 0), toInt(loopCommand.args[2], 0)]
      : null;
    const rangeCommand = blockCommands.find((candidate) => candidate.command === 'range');
    const rangeACommand = blockCommands.find((candidate) => candidate.command === 'rangea');
    const hasScript =
      blockLines.some((candidate) => candidate.inScript) ||
      blockCommands.some((candidate) => candidate.command === '@cmd');

    const frames: ModelFrame[] = [];
    const frameLines = blockCommands.filter((candidate) => candidate.command === 'frame');
    const state = emptyState();
    let segmentStart = animLine.index + 1;

    for (const frameLine of frameLines) {
      const commands: HeaderCommand[] = [];
      const segment = lines.filter(
        (candidate) => candidate.index >= segmentStart && candidate.index < frameLine.index,
      );
      for (const candidate of segment) {
        if (candidate.inScript || !candidate.command) continue;
        if (candidate.command === '@cmd') continue;
        if (applyFrameCommand(state, candidate.command, candidate.args, candidate.index)) {
          commands.push({
            key: candidate.command,
            args: candidate.args,
            line: candidate.index,
            raw: candidate.text,
          });
        }
      }

      const image = frameLine.args[0] && frameLine.args[0].toLowerCase() !== 'none'
        ? frameLine.args[0]
        : null;

      const snapshot: ModelFrame = {
        number: frames.length + 1,
        line: frameLine.index,
        segmentStart,
        image,
        commands,
        hasScript: segment.some((candidate) => candidate.inScript),
        delay: state.delay,
        offset: state.offset ? [...state.offset] : null,
        bbox: state.bbox ? ([...state.bbox] as FrameState['bbox']) : null,
        attack: state.attack ? { ...state.attack } : null,
        move: [...state.move] as [number, number, number],
      };
      frames.push(snapshot);
      segmentStart = frameLine.index + 1;
    }

    const stats = calculateAnimationStats(frames);
    const count = (animationNameCounts.get(name.toLowerCase()) ?? 0) + 1;
    animationNameCounts.set(name.toLowerCase(), count);
    if (count > 1) {
      issues.push({
        severity: 'warning',
        line: animLine.index + 1,
        message: `Duplicate animation name "${name}". OpenBOR keeps animation slots in one registry; duplicate blocks can override each other.`,
      });
    }
    if (frames.length === 0) {
      issues.push({
        severity: 'warning',
        line: animLine.index + 1,
        message: `Animation "${name || '(unnamed)'}" has no frame commands.`,
      });
    }

    animations.push({
      name,
      line: animLine.index,
      endLine,
      loop,
      loopLine: loopCommand?.index ?? null,
      range: rangeCommand
        ? [toInt(rangeCommand.args[0], 0), toInt(rangeCommand.args[1], 0)]
        : null,
      rangeA: rangeACommand
        ? [toInt(rangeACommand.args[0], 0), toInt(rangeACommand.args[1], 0)]
        : null,
      frames,
      hasScript,
      duplicate: count > 1,
      ...stats,
    });
  }

  const stats = emptyStats();
  for (const animation of animations) addStats(stats, animation);

  const model: ParsedModel = {
    text,
    bom,
    eol,
    finalNewline,
    lines,
    header,
    headerEnd,
    name: firstHeaderValue('name'),
    type: firstHeaderValue('type')?.toLowerCase() ?? null,
    subtype: firstHeaderValue('subtype')?.toLowerCase() ?? null,
    animations,
    issues,
    stats,
  };
  return model;
}

function calculateAnimationStats(frames: ModelFrame[]): AnimationStats {
  let totalDelay = 0;
  let totalDamage = 0;
  let totalHits = 0;
  let maxHit = 0;
  let attackFrames = 0;
  let activeDamage = 0;
  for (const frame of frames) {
    totalDelay += frame.delay;
    const damage = frame.attack?.damage ?? 0;
    if (damage > 0) {
      attackFrames += 1;
      if (activeDamage === 0) {
        totalDamage += damage;
        totalHits += 1;
        maxHit = Math.max(maxHit, damage);
      }
    }
    activeDamage = damage;
  }
  return {
    totalFrames: frames.length,
    totalDelay,
    totalDamage,
    totalHits,
    maxHit,
    attackFrames,
    durationSeconds: totalDelay / 100,
  };
}
