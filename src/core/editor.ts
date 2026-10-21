import { joinSourceText, parseModel, splitSourceText } from './parser';
import type { AttackBox, ParsedModel } from './types';

function quoteArg(value: string): string {
  if (value === '') return '""';
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function formatCommand(key: string, args: string[], separator: string): string {
  const trimmed = [...args];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop();
  if (trimmed.length === 0) return key;
  // `separator` reproduces the original gap after the command token; the values
  // themselves are always written with single spaces, as OpenBOR expects.
  return `${key}${separator}${trimmed.map(quoteArg).join(' ')}`;
}

function indentOf(line: string): string {
  return line.match(/^\s*/)?.[0] ?? '';
}

/** Whitespace between the command token and its first argument, if the line has one. */
function separatorAfter(line: string, key: string): string | null {
  const indent = indentOf(line);
  const rest = line.slice(indent.length);
  if (!rest.toLowerCase().startsWith(key.toLowerCase())) return null;
  const gap = rest.slice(key.length).match(/^[ \t]+/)?.[0];
  return gap ?? null;
}

function detectSeparator(model: ParsedModel): string {
  const headerLines = model.lines
    .slice(0, model.headerEnd)
    .filter((line) => line.command && !line.isCommentOnly);
  for (const line of headerLines) {
    const gap = line.command ? separatorAfter(line.text, line.command) : null;
    if (gap) return gap;
  }
  return '\t';
}

function rebuild(
  text: string,
  mutate: (lines: { text: string; eol: string }[]) => void,
): string {
  const { bom, lines, finalNewline } = splitSourceText(text);
  mutate(lines);
  return joinSourceText(lines, bom, finalNewline);
}

function replaceLineText(lines: { text: string; eol: string }[], index: number, next: string): void {
  lines[index] = { text: next, eol: lines[index]?.eol ?? '' };
}

export function setHeaderField(
  text: string,
  key: string,
  args: string[] | null,
): string {
  const model = parseModel(text);
  const separator = detectSeparator(model);
  const entries = model.header.filter((entry) => entry.key === key);
  if (args === null) {
    return rebuild(text, (lines) => {
      for (const entry of [...entries].reverse()) lines.splice(entry.line, 1);
    });
  }
  if (entries.length > 0) {
    const entry = entries[0];
    const source = model.lines[entry.line];
    const indent = indentOf(source.text);
    const gap = separatorAfter(source.text, key) ?? separator;
    const comment = source.comment ? ` ${source.comment}` : '';
    const next = `${indent}${formatCommand(key, args, gap)}${comment}`;
    return rebuild(text, (lines) => replaceLineText(lines, entry.line, next));
  }
  const insertion = findHeaderInsertion(model);
  const indent = detectHeaderIndent(model) ?? '';
  const next = `${indent}${formatCommand(key, args, separator)}`;
  return rebuild(text, (lines) => {
    lines.splice(insertion, 0, { text: next, eol: model.eol });
  });
}

function detectHeaderIndent(model: ParsedModel): string | null {
  for (const entry of model.header) {
    const text = model.lines[entry.line]?.text ?? '';
    if (text.trim()) return indentOf(text);
  }
  return null;
}

function findHeaderInsertion(model: ParsedModel): number {
  if (model.header.length === 0) return 0;
  return model.header[model.header.length - 1].line + 1;
}

export function setHeaderLineArgs(
  text: string,
  line: number,
  key: string,
  args: string[],
): string {
  const model = parseModel(text);
  const source = model.lines[line];
  if (!source) return text;
  const separator = separatorAfter(source.text, source.command ?? key) ?? detectSeparator(model);
  const comment = source.comment ? ` ${source.comment}` : '';
  return replaceLine(
    text,
    line,
    `${indentOf(source.text)}${formatCommand(key, args, separator)}${comment}`,
  );
}

export function addHeaderCommand(text: string, key: string, args: string[]): string {
  const model = parseModel(text);
  const separator = detectSeparator(model);
  const insertion = findHeaderInsertion(model);
  const indent = detectHeaderIndent(model) ?? '';
  return rebuild(text, (lines) => {
    lines.splice(insertion, 0, {
      text: `${indent}${formatCommand(key, args, separator)}`,
      eol: model.eol,
    });
  });
}

export function removeHeaderLine(text: string, line: number): string {
  return rebuild(text, (lines) => {
    if (line >= 0 && line < lines.length) lines.splice(line, 1);
  });
}

export function replaceLine(text: string, line: number, next: string): string {
  return rebuild(text, (lines) => {
    if (line >= 0 && line < lines.length) replaceLineText(lines, line, next);
  });
}

function frameIndent(model: ParsedModel, frameLine: number): string {
  return indentOf(model.lines[frameLine]?.text ?? '');
}

export function setFrameProperty(
  text: string,
  frameLine: number,
  key: string,
  args: string[],
  separator = '\t',
): string {
  const model = parseModel(text);
  const animation = model.animations.find((anim) =>
    anim.frames.some((frame) => frame.line === frameLine),
  );
  if (!animation) return text;
  const frame = animation.frames.find((candidate) => candidate.line === frameLine);
  if (!frame) return text;
  const existing = [...frame.commands].reverse().find((command) => command.key === key);
  if (existing) {
    const source = model.lines[existing.line];
    const comment = source.comment ? ` ${source.comment}` : '';
    const gap = separatorAfter(source.text, existing.key) ?? separator;
    const next = `${indentOf(source.text)}${formatCommand(key, args, gap)}${comment}`;
    return replaceLine(text, existing.line, next);
  }
  const indent = frameIndent(model, frameLine);
  const next = `${indent}${formatCommand(key, args, separator)}`;
  return rebuild(text, (lines) => {
    lines.splice(frameLine, 0, { text: next, eol: model.eol });
  });
}

export function setFrameImage(text: string, frameLine: number, image: string, separator = '\t'): string {
  const model = parseModel(text);
  const source = model.lines[frameLine];
  if (!source) return text;
  const indent = indentOf(source.text);
  const gap = separatorAfter(source.text, 'frame') ?? separator;
  const comment = source.comment ? ` ${source.comment}` : '';
  return replaceLine(
    text,
    frameLine,
    `${indent}frame${gap}${image ? quoteArg(image) : 'none'}${comment}`,
  );
}

export function setAnimationLoop(text: string, animationLine: number, loop: number[]): string {
  const model = parseModel(text);
  const animation = model.animations.find((candidate) => candidate.line === animationLine);
  if (!animation) return text;
  const separator = detectSeparator(model);
  const args = [String(loop[0] ?? 0), String(loop[1] ?? 0), String(loop[2] ?? 0)];
  if (animation.loopLine !== null) {
    const source = model.lines[animation.loopLine];
    const gap = separatorAfter(source.text, 'loop') ?? separator;
    const comment = source.comment ? ` ${source.comment}` : '';
    return replaceLine(
      text,
      animation.loopLine,
      `${indentOf(source.text)}${formatCommand('loop', args, gap)}${comment}`,
    );
  }
  const indent = indentOf(model.lines[animation.line].text);
  return rebuild(text, (lines) => {
    lines.splice(animation.line + 1, 0, {
      text: `${indent}${formatCommand('loop', args, separator)}`,
      eol: model.eol,
    });
  });
}

export function addFrameAfter(
  text: string,
  frameLine: number,
  image: string,
  separator = '\t',
): string {
  const model = parseModel(text);
  const animation = model.animations.find((anim) =>
    anim.frames.some((frame) => frame.line === frameLine),
  );
  if (!animation) return text;
  const source = model.lines[frameLine];
  const indent = indentOf(source.text);
  return rebuild(text, (lines) => {
    lines.splice(frameLine + 1, 0, {
      text: `${indent}frame${separator}${quoteArg(image || 'none')}`,
      eol: model.eol,
    });
  });
}

export function attackToArgs(attack: AttackBox): string[] {
  const base = [
    String(attack.x),
    String(attack.y),
    String(attack.width),
    String(attack.height),
    String(attack.damage),
  ];
  const optional = (value: number | null) => String(value ?? 0);
  if (attack.kind === 'blast') {
    return [
      ...base,
      optional(attack.noBlock),
      optional(attack.noFlash),
      optional(attack.pause),
      optional(attack.z),
    ];
  }
  if (attack.kind === 'freeze') {
    return [
      ...base,
      optional(attack.secondary),
      optional(attack.noBlock),
      optional(attack.noFlash),
      optional(attack.pause),
      optional(attack.z),
    ];
  }
  return [
    ...base,
    optional(attack.secondary),
    optional(attack.noBlock),
    optional(attack.noFlash),
    optional(attack.pause),
    optional(attack.z),
  ];
}

export function setFrameAttack(
  text: string,
  frameLine: number,
  attack: AttackBox | null,
  command = 'attack',
): string {
  if (attack === null) {
    return setFrameProperty(text, frameLine, command, ['0', '0', '0', '0', '0']);
  }
  return setFrameProperty(text, frameLine, command, attackToArgs(attack));
}
