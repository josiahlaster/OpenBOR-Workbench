import { beforeEach, describe, expect, it } from 'vitest';
import { storage } from './db';
import type { Project } from '../core/types';
import { knightRaw } from '../test/fixtures';
import { buildSummary } from '../core/summary';

function project(id: string, updatedAt: number): Project {
  return {
    id,
    name: `Project ${id}`,
    description: '',
    createdAt: 1,
    updatedAt,
    entities: [
      {
        id: `${id}-entity`,
        fileName: 'knight.txt',
        path: 'data/chars/knight/knight.txt',
        raw: knightRaw,
        savedRaw: knightRaw,
        createdAt: 1,
        updatedAt,
        summary: buildSummary(knightRaw),
        revisions: [],
      },
    ],
    modelsFile: null,
    modelsFileName: 'models.txt',
    assetPaths: [],
  };
}

describe('storage', () => {
  beforeEach(async () => {
    await storage.clearAll();
  });

  it('saves and lists projects newest first', async () => {
    await storage.saveProject(project('old', 10));
    await storage.saveProject(project('new', 20));
    const projects = await storage.listProjects();
    expect(projects.map((item) => item.id)).toEqual(['new', 'old']);
    expect(projects[0].entities[0].raw).toBe(knightRaw);
    expect(await storage.getProject('missing')).toBeNull();
  });

  it('deletes a project without touching the rest', async () => {
    await storage.saveProject(project('a', 1));
    await storage.saveProject(project('b', 2));
    await storage.deleteProject('a');
    expect((await storage.listProjects()).map((item) => item.id)).toEqual(['b']);
  });

  it('stores drafts and removes them by project', async () => {
    await storage.saveDraft({ entityId: 'e1', projectId: 'p1', raw: 'draft one', updatedAt: 1 });
    await storage.saveDraft({ entityId: 'e2', projectId: 'p1', raw: 'draft two', updatedAt: 2 });
    await storage.saveDraft({ entityId: 'e3', projectId: 'p2', raw: 'other', updatedAt: 3 });
    expect(await storage.listDrafts()).toHaveLength(3);
    expect((await storage.getDraft('e1'))?.raw).toBe('draft one');
    await storage.deleteDraftsForProject('p1');
    expect((await storage.listDrafts()).map((draft) => draft.entityId)).toEqual(['e3']);
    await storage.deleteDraft('e3');
    expect(await storage.listDrafts()).toEqual([]);
  });

  it('persists settings and clears everything', async () => {
    await storage.saveSettings({
      theme: 'light',
      autosaveDrafts: false,
      showWelcome: false,
      editorFontSize: 16,
    });
    const settings = await storage.getSettings();
    expect(settings?.theme).toBe('light');
    expect(settings?.editorFontSize).toBe(16);
    await storage.clearAll();
    expect(await storage.listProjects()).toEqual([]);
    expect(await storage.getSettings()).toBeNull();
  });
});
