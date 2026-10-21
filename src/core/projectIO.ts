import { buildSummary } from './summary';
import type { Project } from './types';

export interface ProjectBundle {
  format: 'openbor-stats-project';
  version: 1;
  exportedAt: string;
  project: Project;
}

export function serializeProjectBundle(project: Project): string {
  const bundle: ProjectBundle = {
    format: 'openbor-stats-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(bundle, null, 2);
}

export function parseProjectBundle(text: string): Project {
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null) {
    throw new Error('The file is not a project bundle.');
  }
  const bundle = data as Partial<ProjectBundle>;
  if (bundle.format !== 'openbor-stats-project' || !bundle.project) {
    throw new Error('This file is not an OpenBOR Stats project bundle.');
  }
  const project = bundle.project;
  if (typeof project.id !== 'string' || typeof project.name !== 'string' || !Array.isArray(project.entities)) {
    throw new Error('The project bundle is missing required fields.');
  }
  return {
    ...project,
    entities: project.entities.map((entity) => ({
      ...entity,
      summary: entity.summary ?? buildSummary(entity.raw),
      revisions: Array.isArray(entity.revisions) ? entity.revisions : [],
      notes: entity.notes ?? '',
      raw: typeof entity.raw === 'string' ? entity.raw : '',
      savedRaw: typeof entity.savedRaw === 'string' ? entity.savedRaw : entity.raw,
    })),
    assetPaths: Array.isArray(project.assetPaths) ? project.assetPaths : [],
    modelsFile: typeof project.modelsFile === 'string' ? project.modelsFile : null,
    modelsFileName: project.modelsFileName || 'models.txt',
    createdAt: Number(project.createdAt) || Date.now(),
    updatedAt: Number(project.updatedAt) || Date.now(),
  };
}
