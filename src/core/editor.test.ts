import { describe, expect, it } from 'vitest';
import {
  addFrameAfter,
  removeHeaderLine,
  setAnimationLoop,
  setFrameAttack,
  setFrameImage,
  setFrameProperty,
  setHeaderField,
} from './editor';
import { parseModel } from './parser';
import { knightRaw } from '../test/fixtures';

function lineCount(text: string): number {
  return text.split(/\r\n|\n|\r/).length;
}

describe('header editing', () => {
  it('changes only the value and keeps alignment, comments, and unknown fields', () => {
    const next = setHeaderField(knightRaw, 'health', ['320']);
    expect(next).toContain('health      320');
    expect(next).not.toContain('health      240');
    expect(next).toContain('custom_note  preserved by OpenBOR Stats');
    expect(next).toContain('# Unknown commands and comments must survive every edit.');
    expect(lineCount(next)).toBe(lineCount(knightRaw));
    expect(parseModel(next).header.find((entry) => entry.key === 'health')?.args).toEqual(['320']);
  });

  it('preserves an inline comment when rewriting a header line', () => {
    const source = 'name Test\nhealth 100   # keep this note\ntype enemy\n';
    const next = setHeaderField(source, 'health', ['250']);
    expect(next).toContain('health 250 # keep this note');
    expect(parseModel(next).name).toBe('Test');
  });

  it('inserts a missing field before the first animation block', () => {
    const next = setHeaderField(knightRaw, 'aggression', ['2']);
    const model = parseModel(next);
    const inserted = model.header.find((entry) => entry.key === 'aggression');
    expect(inserted?.args).toEqual(['2']);
    expect(inserted?.line).toBeLessThan(model.animations[0].line);
    expect(model.lines[inserted!.line].text.startsWith('aggression')).toBe(true);
  });

  it('removes a field without disturbing other lines', () => {
    const next = setHeaderField(knightRaw, 'icon', null);
    expect(next).not.toContain('data/chars/knight/icon.gif');
    expect(next).toContain('custom_note  preserved by OpenBOR Stats');
    expect(next).toContain('\tframe\tdata/chars/knight/idle_01.png');
    expect(lineCount(next)).toBe(lineCount(knightRaw) - 1);
  });

  it('removes an arbitrary header line by index', () => {
    const model = parseModel(knightRaw);
    const target = model.header.find((entry) => entry.key === 'mp')!;
    const next = removeHeaderLine(knightRaw, target.line);
    expect(parseModel(next).header.some((entry) => entry.key === 'mp')).toBe(false);
    expect(parseModel(next).animations).toHaveLength(11);
  });

  it('preserves CRLF line endings when editing', () => {
    const source = 'name Test\r\ntype enemy\r\nhealth 100\r\n\r\nanim idle\r\n\tframe none\r\n';
    const next = setHeaderField(source, 'health', ['200']);
    expect(next).toContain('health 200\r\n');
    expect(next).not.toContain('\n\n');
    expect(parseModel(next).eol).toBe('\r\n');
    expect(parseModel(next).finalNewline).toBe(true);
  });
});

describe('frame editing', () => {
  const model = parseModel(knightRaw);
  const attackFrame = model.animations.find((animation) => animation.name === 'attack1')!.frames[0];

  it('changes a frame delay in place', () => {
    const next = setFrameProperty(knightRaw, attackFrame.line, 'delay', ['8']);
    const updated = parseModel(next).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.frames[0].delay).toBe(8);
    expect(next).toContain('\tdelay\t8');
    expect(next).toContain('custom_note');
  });

  it('does not duplicate an existing command', () => {
    const next = setFrameProperty(knightRaw, attackFrame.line, 'bbox', ['1', '2', '3', '4']);
    const updated = parseModel(next).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.frames[0].bbox?.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(next.match(/\tbbox\t/g)).toHaveLength(knightRaw.match(/\tbbox\t/g)!.length);
  });

  it('adds a body box before a frame that has none', () => {
    const spawn = model.animations.find((animation) => animation.name === 'spawn')!;
    const next = setFrameProperty(knightRaw, spawn.frames[0].line, 'bbox', ['4', '0', '40', '80']);
    const updated = parseModel(next).animations.find((animation) => animation.name === 'spawn')!;
    expect(updated.frames[0].bbox?.slice(0, 4)).toEqual([4, 0, 40, 80]);
    expect(updated.hasScript).toBe(true);
  });

  it('rewrites an attack box and keeps the rest of the frame', () => {
    const sourceBox = attackFrame.attack!;
    const next = setFrameAttack(knightRaw, attackFrame.line, { ...sourceBox, damage: 25 });
    const updated = parseModel(next).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.frames[0].attack?.damage).toBe(25);
    expect(updated.frames[0].attack?.secondary).toBe(sourceBox.secondary);
    expect(updated.frames[0].bbox).toEqual(attackFrame.bbox);
    expect(updated.totalDamage).toBe(25);
  });

  it('clears an attack box with the zero form', () => {
    const next = setFrameAttack(knightRaw, attackFrame.line, null);
    const updated = parseModel(next).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.frames[0].attack).toBeNull();
  });

  it('quotes frame image paths that contain spaces', () => {
    const next = setFrameImage(knightRaw, attackFrame.line, 'data/chars/knight/hit 01.png');
    const updated = parseModel(next).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.frames[0].image).toBe('data/chars/knight/hit 01.png');
    expect(next).toContain('"data/chars/knight/hit 01.png"');
  });

  it('adds a frame after an existing one', () => {
    const next = addFrameAfter(knightRaw, attackFrame.line, 'data/chars/knight/extra.png');
    const updated = parseModel(next).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.frames).toHaveLength(3);
    expect(updated.frames[1].image).toBe('data/chars/knight/extra.png');
  });

  it('writes or updates a loop command', () => {
    const walk = model.animations.find((animation) => animation.name === 'walk')!;
    const next = setAnimationLoop(knightRaw, walk.line, [1, 2, 0]);
    expect(parseModel(next).animations.find((animation) => animation.name === 'walk')?.loop).toEqual([
      1, 2, 0,
    ]);

    const attack = model.animations.find((animation) => animation.name === 'attack1')!;
    const withLoop = setAnimationLoop(knightRaw, attack.line, [0, 1, 0]);
    const updated = parseModel(withLoop).animations.find((animation) => animation.name === 'attack1')!;
    expect(updated.loop).toEqual([0, 1, 0]);
    expect(updated.frames[0].attack?.damage).toBe(18);
  });
});
