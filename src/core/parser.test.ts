import { describe, expect, it } from 'vitest';
import {
  joinSourceText,
  parseModel,
  splitInlineComment,
  splitSourceText,
  tokenizeLine,
} from './parser';
import { bruteRaw, invalidRaw, knightRaw } from '../test/fixtures';

describe('tokenizeLine', () => {
  it('splits on whitespace and keeps quoted values together', () => {
    expect(tokenizeLine('frame data/chars/a b.png')).toEqual(['frame', 'data/chars/a', 'b.png']);
    expect(tokenizeLine('frame "data/chars/a b.png"')).toEqual(['frame', 'data/chars/a b.png']);
    expect(tokenizeLine('load Knight ""')).toEqual(['load', 'Knight', '']);
  });

  it('keeps an apostrophe inside a name literal, as OpenBOR does', () => {
    expect(tokenizeLine("know\tbiker-K'\tdata/chars/biker-k/biker-k.txt")).toEqual([
      'know',
      "biker-K'",
      'data/chars/biker-k/biker-k.txt',
    ]);
    expect(splitInlineComment("spawn\tbiker-k' # note")).toEqual({
      content: "spawn\tbiker-k' ",
      comment: '# note',
    });
  });

  it('does not treat a hash inside quotes as a comment', () => {
    expect(splitInlineComment('name "a#b" # real comment')).toEqual({
      content: 'name "a#b" ',
      comment: '# real comment',
    });
    expect(splitInlineComment('frame data/a.png')).toEqual({
      content: 'frame data/a.png',
      comment: null,
    });
  });
});

describe('splitSourceText / joinSourceText', () => {
  it('round-trips mixed content, final newline, and BOM exactly', () => {
    const text = '\uFEFFname Test\r\n\r\n# comment\r\nanim idle\r\n\tframe none\r\n';
    const split = splitSourceText(text);
    expect(split.bom).toBe('\uFEFF');
    expect(split.eol).toBe('\r\n');
    expect(split.finalNewline).toBe(true);
    expect(joinSourceText(split.lines, split.bom, split.finalNewline)).toBe(text);
  });
});

describe('parseModel', () => {
  const model = parseModel(knightRaw);

  it('reads the identity headers and preserves every header line', () => {
    expect(model.name).toBe('Knight');
    expect(model.type).toBe('player');
    expect(model.subtype).toBe('none');
    expect(model.header).toHaveLength(19);
    expect(model.header.filter((entry) => entry.key === 'load')).toHaveLength(2);
    expect(model.header.find((entry) => entry.key === 'custom_note')?.args).toEqual([
      'preserved',
      'by',
      'OpenBOR',
      'Stats',
    ]);
    expect(model.headerEnd).toBe(model.animations[0].line);
  });

  it('derives frame, delay, and animation stats from the real fixture', () => {
    expect(model.animations).toHaveLength(11);
    expect(model.stats).toEqual({
      totalFrames: 25,
      totalDelay: 229,
      totalDamage: 104,
      totalHits: 4,
      maxHit: 32,
      // The blast window in freespecial1 stays active across two frames.
      attackFrames: 5,
      durationSeconds: 2.29,
    });
    const idle = model.animations.find((animation) => animation.name === 'idle');
    expect(idle?.frames).toHaveLength(3);
    expect(idle?.loop).toEqual([1, 0, 0]);
    expect(idle?.frames[0].bbox?.slice(0, 4)).toEqual([8, 0, 48, 82]);
    expect(idle?.frames[0].offset).toEqual([32, 84]);
    expect(idle?.frames[0].delay).toBe(10);
  });

  it('parses legacy attack boxes and carries state across frames', () => {
    const attack1 = model.animations.find((animation) => animation.name === 'attack1');
    expect(attack1?.totalDamage).toBe(18);
    expect(attack1?.totalHits).toBe(1);
    const box = attack1?.frames[0].attack;
    expect(box).toMatchObject({
      kind: 'normal',
      x: 30,
      y: -72,
      width: 46,
      height: 30,
      damage: 18,
      secondary: 1,
      noBlock: 0,
      noFlash: 0,
      pause: 5,
      z: 4,
      short: false,
    });
    // A zeroed attack command clears the box rather than adding damage.
    expect(attack1?.frames[1].attack).toBeNull();
    const special = model.animations.find((animation) => animation.name === 'freespecial1');
    expect(special?.frames[0].attack?.kind).toBe('blast');
    expect(special?.frames[0].attack?.damage).toBe(30);
  });

  it('keeps inline scripts opaque and does not parse commands inside them', () => {
    const spawn = model.animations.find((animation) => animation.name === 'spawn');
    expect(spawn?.hasScript).toBe(true);
    expect(spawn?.frames).toHaveLength(1);
    const scriptLine = model.lines.find((line) => line.text.includes('void main'));
    expect(scriptLine?.inScript).toBe(true);
    expect(scriptLine?.command).toBeNull();
  });

  it('parses a malformed file without throwing', () => {
    const invalid = parseModel(invalidRaw);
    expect(invalid.name).toBeNull();
    expect(invalid.type).toBe('enemy');
    expect(invalid.animations).toEqual([]);
    expect(invalid.stats.totalFrames).toBe(0);
  });

  it('parses both fixtures consistently', () => {
    const brute = parseModel(bruteRaw);
    expect(brute.name).toBe('Brute');
    expect(brute.animations).toHaveLength(6);
    expect(brute.stats.totalFrames).toBe(12);
    expect(brute.stats.totalDamage).toBe(48);
  });
});
