import { describe, expect, it } from 'vitest';
import { importFiles, normalizeVirtualPath, safeFileName, type FileInput } from './importer';
import { knightRaw, bruteRaw, invalidRaw, modelsRaw } from '../test/fixtures';

function file(name: string, text: string, path = name): FileInput {
  return { name, path, size: text.length, text };
}

describe('importFiles', () => {
  it('imports a folder of models plus models.txt and indexes paths', () => {
    const result = importFiles([
      file('models.txt', modelsRaw, 'mygame/models.txt'),
      file('knight.txt', knightRaw, 'mygame/data/chars/knight/knight.txt'),
      file('brute.txt', bruteRaw, 'mygame/data/chars/brute/brute.txt'),
      file('icon.gif', '', 'mygame/data/chars/knight/icon.gif'),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.entities).toHaveLength(2);
    expect(result.modelsFile).toBe(modelsRaw);
    expect(result.assetPaths).toHaveLength(4);
    expect(result.entities[1].path).toBe('mygame/data/chars/brute/brute.txt');
    expect(result.entities[1].raw).toBe(bruteRaw);
    expect(result.entities[1].summary.warnings).toBe(1);
    expect(result.entities[1].summary.name).toBe('Brute');
  });

  it('rejects files that are not models and keeps valid ones', () => {
    const result = importFiles([
      file('no-name.txt', invalidRaw, 'data/chars/no-name.txt'),
      file('knight.txt', knightRaw, 'data/chars/knight/knight.txt'),
    ]);
    expect(result.entities).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0].message).toContain('does not look like an OpenBOR model');
  });

  it('skips duplicate paths with a warning', () => {
    const result = importFiles([
      file('knight.txt', knightRaw, 'data/chars/knight/knight.txt'),
      file('knight-copy.txt', knightRaw, 'data/chars/knight/knight.txt'),
    ]);
    expect(result.entities).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.warnings.some((warning) => warning.message.includes('already imported'))).toBe(true);
  });

  it('imports level files as browsable entities without model validation errors', () => {
    const level = 'name Stage\nbgspeed 10\nbackground data/bg.png\n';
    const result = importFiles([file('stage1.txt', level, 'data/levels/stage1.txt')]);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].path).toBe('data/levels/stage1.txt');
    expect(result.entities[0].summary.errors).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('keeps binary image blobs for storage', () => {
    const blob = new Blob(['gif'], { type: 'image/gif' });
    const result = importFiles([
      { name: 'duck1.gif', path: 'demo/data/chars/angel/duck1.gif', size: 3, blob },
    ]);
    expect(result.assetBlobs).toEqual([{ path: 'demo/data/chars/angel/duck1.gif', blob }]);
  });

  it('enforces the text file size limit', () => {
    const huge = { ...file('huge.txt', 'name Huge\n'), size: 3 * 1024 * 1024 };
    const result = importFiles([huge]);
    expect(result.entities).toEqual([]);
    expect(result.errors[0].message).toContain('2 MB');
    expect(result.skipped).toBe(1);
  });

  it('does not add arbitrary non-model text files as entities', () => {
    const result = importFiles([file('readme.txt', 'just some notes\n', 'readme.txt')]);
    expect(result.entities).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});

describe('path helpers', () => {
  it('normalizes traversal and separators', () => {
    expect(normalizeVirtualPath('../../data\\\\chars\\boss.txt')).toBe('data/chars/boss.txt');
    expect(safeFileName('data/chars/bad:name?.txt')).toBe('bad_name_.txt');
  });
});
