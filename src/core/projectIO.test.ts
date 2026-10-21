import { describe, expect, it } from 'vitest';
import { parseProjectBundle, serializeProjectBundle } from './projectIO';
import { createBackup, parseBackup } from '../storage/db';
import { parseModel } from './parser';
import { buildSummary } from './summary';
import type { Project } from './types';
import { knightRaw } from '../test/fixtures';

function project(): Project {
  return {
    id: 'p1',
    name: 'Bundle test',
    description: 'round trip',
    createdAt: 10,
    updatedAt: 20,
    entities: [
      {
        id: 'e1',
        fileName: 'knight.txt',
        path: 'data/chars/knight/knight.txt',
        raw: knightRaw,
        savedRaw: knightRaw,
        createdAt: 10,
        updatedAt: 20,
        summary: buildSummary(knightRaw),
        revisions: [
          {
            id: 'r1',
            savedAt: 15,
            label: 'Original',
            raw: knightRaw,
            stats: parseModel(knightRaw).stats,
          },
        ],
        notes: 'keep me',
      },
    ],
    modelsFile: 'load Knight data/chars/knight/knight.txt\n',
    modelsFileName: 'models.txt',
    assetPaths: ['data/chars/knight/knight.txt'],
  };
}

describe('project bundles', () => {
  it('round-trips a project without data loss', () => {
    const source = project();
    const parsed = parseProjectBundle(serializeProjectBundle(source));
    expect(parsed.id).toBe('p1');
    expect(parsed.name).toBe('Bundle test');
    expect(parsed.entities).toHaveLength(1);
    expect(parsed.entities[0].raw).toBe(knightRaw);
    expect(parsed.entities[0].notes).toBe('keep me');
    expect(parsed.entities[0].summary.name).toBe('Knight');
    expect(parsed.modelsFile).toBe(source.modelsFile);
    expect(parsed.entities[0].revisions).toHaveLength(1);
  });

  it('rejects unrelated JSON with a clear message', () => {
    expect(() => parseProjectBundle('{"format":"other"}')).toThrow(/not an OpenBOR Stats project bundle/);
    expect(() => parseProjectBundle('not json')).toThrow();
  });

  it('builds and validates a full backup', () => {
    const backup = createBackup([project()], {
      theme: 'dark',
      autosaveDrafts: true,
      showWelcome: false,
      editorFontSize: 14,
    });
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.settings?.editorFontSize).toBe(14);
    expect(() => parseBackup('{"format":"unknown"}')).toThrow(/not an OpenBOR Stats backup/);
  });
});
