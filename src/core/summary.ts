import { parseModel } from './parser';
import { validateModel } from './validation';
import type { EntitySummary, ParsedModel } from './types';

export function emptySummary(parseError?: string): EntitySummary {
  return {
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
    parseError,
  };
}

export function buildSummary(raw: string, context: { modelNames?: string[] } = {}): EntitySummary {
  try {
    const model = parseModel(raw);
    const findings = validateModel(model, context);
    return summaryFromModel(model, findings);
  } catch (error) {
    return emptySummary(error instanceof Error ? error.message : String(error));
  }
}

export function summaryFromModel(
  model: ParsedModel,
  findings: { severity: 'error' | 'warning' | 'info' }[],
): EntitySummary {
  const healthValue = model.header.find((entry) => entry.key === 'health')?.args[0];
  const speedValue = model.header.find((entry) => entry.key === 'speed')?.args[0];
  const health = healthValue === undefined ? null : Number(healthValue);
  const speed = speedValue === undefined ? null : Number(speedValue);
  return {
    name: model.name,
    type: model.type,
    subtype: model.subtype,
    animationCount: model.animations.length,
    frameCount: model.stats.totalFrames,
    totalDamage: model.stats.totalDamage,
    health: health !== null && Number.isFinite(health) ? health : null,
    speed: speed !== null && Number.isFinite(speed) ? speed : null,
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
  };
}

export function countIssues(raw: string, context: { modelNames?: string[] } = {}): {
  errors: number;
  warnings: number;
} {
  try {
    const model = parseModel(raw);
    const findings = validateModel(model, context);
    return {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
    };
  } catch {
    return { errors: 1, warnings: 0 };
  }
}
