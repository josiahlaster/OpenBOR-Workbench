import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildProjectZip, enginePathFor } from './playtest';
import type { Project, ProjectEntity } from '../core/types';

function entity(path: string, raw: string): ProjectEntity {
  return {
    id: path,
    fileName: path.split('/').pop() ?? path,
    path,
    raw,
    savedRaw: raw,
    createdAt: 0,
    updatedAt: 0,
    revisions: [],
    summary: {
      name: null,
      type: null,
      subtype: null,
      animationCount: 0,
      frameCount: 0,
      totalDamage: 0,
      health: null,
      speed: null,
      errors: 0,
      warnings: 0,
    },
  };
}

describe('enginePathFor', () => {
  it('starts the path at the data folder', () => {
    expect(enginePathFor('mygame/data/chars/angel/angel.txt')).toBe('data/chars/angel/angel.txt');
    expect(enginePathFor('demo\\data\\levels\\demo\\stage.txt')).toBe('data/levels/demo/stage.txt');
  });

  it('places paths without a data folder under data/', () => {
    expect(enginePathFor('angel.txt')).toBe('data/angel.txt');
  });
});

describe('buildProjectZip', () => {
  it('writes entities, models.txt and the engine layout', async () => {
    const project = {
      id: 'project-zip-test',
      name: 'Zip test',
      description: '',
      createdAt: 0,
      updatedAt: 0,
      entities: [entity('demo/data/chars/angel/angel.txt', 'name Angel\n')],
      modelsFile: 'load Angel data/chars/angel/angel.txt\n',
      modelsFileName: 'models.txt',
      assetPaths: [],
      revisions: [],
    } as unknown as Project;

    const files = unzipSync(await buildProjectZip(project));
    const fileNames = Object.keys(files).filter((name) => !name.endsWith('/')).sort();
    expect(fileNames).toEqual(['data/chars/angel/angel.txt', 'data/models.txt']);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['data/', 'data/chars/', 'data/chars/angel/']));
    expect(new TextDecoder().decode(files['data/chars/angel/angel.txt'])).toBe('name Angel\n');
    expect(new TextDecoder().decode(files['data/models.txt'])).toContain('load Angel');
  });

  it('adds lowercase copies so the engine finds mixed-case files', async () => {
    const project = {
      id: 'project-case-test',
      name: 'Case test',
      description: '',
      createdAt: 0,
      updatedAt: 0,
      entities: [entity('grid/data/LEVELS.TXT', 'name Levels\n')],
      modelsFile: null,
      modelsFileName: 'models.txt',
      assetPaths: [],
      revisions: [],
    } as unknown as Project;

    const files = unzipSync(await buildProjectZip(project));
    expect(new TextDecoder().decode(files['data/levels.txt'])).toBe('name Levels\n');
    expect(new TextDecoder().decode(files['data/LEVELS.TXT'])).toBe('name Levels\n');
  });

  it('writes files under the casing that models and levels reference', async () => {
    const project = {
      id: 'project-reference-test',
      name: 'Reference test',
      description: '',
      createdAt: 0,
      updatedAt: 0,
      entities: [
        entity('Data/CHARS/Lobster/lobster.txt', 'name Lobster\nanim idle\n\tframe data/chars/Lobster/alt1.gif\n'),
        entity('Data/CHARS/Lobster/alt1.gif', 'gif'),
      ],
      modelsFile: 'load Lobster data/chars/Lobster/Lobster.txt\n',
      modelsFileName: 'models.txt',
      assetPaths: [],
      revisions: [],
    } as unknown as Project;

    const files = unzipSync(await buildProjectZip(project));
    expect(new TextDecoder().decode(files['data/chars/Lobster/Lobster.txt'])).toContain('name Lobster');
    expect(files['data/chars/Lobster/alt1.gif']).toBeDefined();
    expect(files['data/chars/lobster/lobster.txt']).toBeDefined();
  });
});
