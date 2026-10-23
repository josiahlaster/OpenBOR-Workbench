import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { parseModel } from './core/parser';
import { buildSummary } from './core/summary';
import type { Project } from './core/types';
import { storage } from './storage/db';
import { bruteRaw, knightRaw, modelsRaw } from './test/fixtures';

const projectId = 'workflow-project';
const entityId = 'workflow-knight';

function seededProject(): Project {
  return {
    id: projectId,
    name: 'Workflow demo',
    description: '',
    createdAt: 1,
    updatedAt: 2,
    entities: [
      {
        id: entityId,
        fileName: 'knight.txt',
        path: 'data/chars/knight/knight.txt',
        raw: knightRaw,
        savedRaw: knightRaw,
        createdAt: 1,
        updatedAt: 2,
        summary: buildSummary(knightRaw),
        revisions: [
          {
            id: 'seed-revision',
            savedAt: 2,
            label: 'Imported',
            raw: knightRaw,
            stats: parseModel(knightRaw).stats,
          },
        ],
      },
    ],
    modelsFile: 'load Knight data/chars/knight/knight.txt\n',
    modelsFileName: 'models.txt',
    assetPaths: [],
  };
}

function fileWithPath(name: string, text: string, path: string): File {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

describe('application workflow', () => {
  beforeEach(async () => {
    await storage.clearAll();
    localStorage.clear();
    window.location.hash = '#/dashboard';
  });

  it('loads a saved project, shows validation, edits health, and persists it', async () => {
    await storage.saveProject(seededProject());
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Project dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('Knight').length).toBeGreaterThan(0);
    expect(screen.getByText('240')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /^Validation/ }));
    expect(await screen.findByRole('heading', { name: 'Validation' })).toBeInTheDocument();
    const unknown = await screen.findAllByText(/"custom_note" is not in the validation catalog/);
    expect(unknown.length).toBeGreaterThan(0);

    window.location.hash = `#/editor/${entityId}`;
    // Editors now open on the Code tab; the structured fields live under Overview.
    await userEvent.click(await screen.findByRole('tab', { name: /Overview/ }));
    const health = await screen.findByLabelText('Health');
    await userEvent.type(health, '{Backspace}{Backspace}{Backspace}320{Enter}');
    await waitFor(() => expect((health as HTMLInputElement).value).toBe('320'));
    expect(await screen.findByText(/Editing local draft/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(
      async () => {
        const saved = await storage.getProject(projectId);
        expect(saved?.entities[0].raw).toContain('health      320');
        expect(saved?.entities[0].revisions.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 },
    );

    window.location.hash = '#/validation';
    expect(await screen.findByRole('heading', { name: 'Validation' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('2 errors')).not.toBeInTheDocument());
  });

  it('imports a folder into a new project through the real dialog', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /Edit, validate and compare OpenBOR game data/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog');

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, [
      fileWithPath('models.txt', modelsRaw, 'demo/models.txt'),
      fileWithPath('knight.txt', knightRaw, 'demo/data/chars/knight/knight.txt'),
      fileWithPath('brute.txt', bruteRaw, 'demo/data/chars/brute/brute.txt'),
    ]);

    const name = await within(dialog).findByLabelText(/Project name/);
    await waitFor(() => expect((name as HTMLInputElement).value).toBe('demo'));
    fireEvent.change(name, { target: { value: 'Imported demo' } });
    expect(await within(dialog).findByText('2 models ready')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { name: 'Entities' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Brute/ })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Table' }));
    expect(await screen.findByRole('link', { name: 'Knight' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Brute' })).toBeInTheDocument();

    const projects = await storage.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Imported demo');
    expect(projects[0].entities).toHaveLength(2);
    expect(projects[0].entities.map((entity) => entity.path).sort()).toEqual([
      'demo/data/chars/brute/brute.txt',
      'demo/data/chars/knight/knight.txt',
    ]);
    expect(projects[0].modelsFile).toBe(modelsRaw);
  });
});
