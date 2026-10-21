import { describe, expect, it } from 'vitest';
import { parseModel } from './parser';
import { validateModel, validateProject } from './validation';
import { buildSummary } from './summary';
import type { Project, ProjectEntity } from './types';
import { bruteRaw, invalidRaw, knightRaw, modelsRaw } from '../test/fixtures';

function codes(findings: { code: string }[]): string[] {
  return findings.map((finding) => finding.code);
}

function entityFrom(raw: string, name: string, path: string): ProjectEntity {
  return {
    id: name.toLowerCase(),
    fileName: `${name.toLowerCase()}.txt`,
    path,
    raw,
    savedRaw: raw,
    createdAt: 1,
    updatedAt: 1,
    summary: buildSummary(raw),
    revisions: [],
  };
}

function projectWith(entities: ProjectEntity[], extra: Partial<Project> = {}): Project {
  return {
    id: 'project',
    name: 'Test project',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    entities,
    modelsFile: modelsRaw,
    modelsFileName: 'models.txt',
    assetPaths: [],
    ...extra,
  };
}

describe('validateModel', () => {
  it('accepts the Knight fixture with only documented warnings', () => {
    const findings = validateModel(parseModel(knightRaw));
    expect(findings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(codes(findings).sort()).toEqual(['BBOX_MISSING', 'FIELD_UNKNOWN']);
    expect(findings.every((finding) => typeof finding.message === 'string')).toBe(true);
  });

  it('reports missing headers, invalid numbers, and missing animations', () => {
    const findings = validateModel(parseModel(invalidRaw));
    const list = codes(findings);
    expect(list).toContain('NAME_MISSING');
    expect(list).toContain('ANIM_MISSING');
    expect(list).toContain('FIELD_NUMBER');
    expect(list).toContain('SPEED_RANGE');
    expect(list).toContain('FIELD_UNKNOWN');
    expect(findings.some((finding) => finding.severity === 'error')).toBe(true);
  });

  it('rejects an unknown entity type', () => {
    const text = 'name Bad\ntype dragon\nhealth 100\nanim idle\n\tbbox 0 0 10 10\n\tframe none\n';
    const findings = validateModel(parseModel(text));
    expect(codes(findings)).toContain('TYPE_INVALID');
  });

  it('rejects zero health on characters', () => {
    const text = 'name Bad\ntype enemy\nhealth 0\nanim idle\n\tbbox 0 0 10 10\n\tframe none\n';
    const findings = validateModel(parseModel(text));
    expect(codes(findings)).toContain('HEALTH_ZERO');
  });

  it('flags short attack boxes and duplicate animations', () => {
    const text = [
      'name Short',
      'type enemy',
      'health 10',
      'anim idle',
      '\tbbox 0 0 10 10',
      '\tattack 1 2 3',
      '\tframe none',
      'anim idle',
      '\tbbox 0 0 10 10',
      '\tframe none',
    ].join('\n');
    const findings = validateModel(parseModel(text));
    expect(codes(findings)).toContain('ATTACK_SHORT');
    expect(codes(findings)).toContain('ANIM_DUPLICATE');
  });

  it('checks frame images only when the project has real assets', () => {
    const model = parseModel(knightRaw);
    const withoutAssets = validateModel(model);
    expect(codes(withoutAssets)).not.toContain('FRAME_ASSET');
    const withAssets = validateModel(model, {
      assetPaths: ['data/chars/knight/idle_01.png'],
    });
    const missing = withAssets.filter((finding) => finding.code === 'FRAME_ASSET');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((finding) => finding.severity === 'warning')).toBe(true);
    expect(codes(withAssets)).toContain('ASSET_MISSING');
  });

  it('detects duplicate model names inside a project', () => {
    const findings = validateModel(parseModel(knightRaw), {
      modelNames: ['Knight', 'knight'],
    });
    expect(codes(findings)).toContain('NAME_DUPLICATE_PROJECT');
  });
});

describe('validateProject', () => {
  const knight = entityFrom(knightRaw, 'Knight', 'data/chars/knight/knight.txt');
  const brute = entityFrom(bruteRaw, 'Brute', 'data/chars/brute/brute.txt');

  it('counts findings across entities and the manifest', () => {
    const validation = validateProject(projectWith([knight, brute]));
    expect(validation.errors).toBe(0);
    expect(validation.warnings).toBe(3);
    expect(validation.project).toEqual([]);
    expect(Object.keys(validation.perEntity)).toHaveLength(2);
  });

  it('reports a missing manifest', () => {
    const validation = validateProject(projectWith([knight], { modelsFile: null }));
    expect(validation.project.map((finding) => finding.code)).toContain('MANIFEST_MISSING');
  });

  it('reports manifest entries that point at missing entities', () => {
    const manifest = 'load Knight data/chars/knight/knight.txt\nload Ghost data/chars/ghost/ghost.txt\n';
    const validation = validateProject(projectWith([knight], { modelsFile: manifest }));
    const missing = validation.project.filter((finding) => finding.code === 'MANIFEST_REF');
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toContain('Ghost');
  });

  it('reports duplicate model names and file paths at project level', () => {
    const duplicateName = entityFrom(
      bruteRaw.replace('name        Brute', 'name        Knight'),
      'KnightCopy',
      'data/chars/knight_copy/knight.txt',
    );
    const duplicatePath = entityFrom(bruteRaw, 'BruteCopy', 'data/chars/knight/knight.txt');
    const validation = validateProject(projectWith([knight, duplicateName, duplicatePath]));
    const list = validation.project.map((finding) => finding.code);
    expect(list).toContain('PROJECT_NAME_DUPLICATE');
    expect(list).toContain('PROJECT_PATH_DUPLICATE');
  });
});
