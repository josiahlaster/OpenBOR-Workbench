import { FIELD_BY_KEY } from './fields';
import type {
  AnimationStats,
  CompareMetric,
  HeaderCommand,
  ParsedModel,
} from './types';

export interface HeaderDiff {
  key: string;
  label: string;
  a: string | null;
  b: string | null;
  changed: boolean;
}

export interface AnimationDiff {
  name: string;
  aFrames: number | null;
  bFrames: number | null;
  aDelay: number | null;
  bDelay: number | null;
  aDamage: number | null;
  bDamage: number | null;
  aHits: number | null;
  bHits: number | null;
  changed: boolean;
}

export interface ModelComparison {
  header: HeaderDiff[];
  changedHeaders: HeaderDiff[];
  metrics: CompareMetric[];
  animations: AnimationDiff[];
  nameA: string;
  nameB: string;
}

function commandValue(command: HeaderCommand | undefined): string | null {
  if (!command) return null;
  return command.args.join(' ');
}

function mergedHeaderKeys(a: ParsedModel, b: ParsedModel): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const entry of [...a.header, ...b.header]) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    keys.push(entry.key);
  }
  return keys;
}

function firstCommand(model: ParsedModel, key: string): HeaderCommand | undefined {
  return model.header.find((entry) => entry.key === key);
}

export function compareModels(a: ParsedModel, b: ParsedModel): ModelComparison {
  const header = mergedHeaderKeys(a, b).map((key) => {
    const aValue = commandValue(firstCommand(a, key));
    const bValue = commandValue(firstCommand(b, key));
    return {
      key,
      label: FIELD_BY_KEY.get(key)?.label ?? key,
      a: aValue,
      b: bValue,
      changed: aValue !== bValue,
    };
  });

  const numberHeader = (model: ParsedModel, key: string): number | null => {
    const value = firstCommand(model, key)?.args[0];
    if (value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const metric = (
    label: string,
    aValue: number | null,
    bValue: number | null,
    unit?: string,
    higherIsBetter?: boolean,
  ): CompareMetric => ({ label, a: aValue, b: bValue, unit, higherIsBetter });

  const metrics: CompareMetric[] = [
    metric('Health', numberHeader(a, 'health'), numberHeader(b, 'health')),
    metric('MP', numberHeader(a, 'mp'), numberHeader(b, 'mp')),
    metric('Walking speed', numberHeader(a, 'speed'), numberHeader(b, 'speed')),
    metric('Run speed', numberHeader(a, 'running'), numberHeader(b, 'running'), 'engine units'),
    metric('Animations', a.animations.length, b.animations.length),
    metric('Frames', a.stats.totalFrames, b.stats.totalFrames),
    metric('Delay', a.stats.totalDelay, b.stats.totalDelay, 'centiseconds'),
    metric('Attack damage', a.stats.totalDamage, b.stats.totalDamage),
    metric('Separate hits', a.stats.totalHits, b.stats.totalHits),
    metric('Max hit', a.stats.maxHit, b.stats.maxHit),
    metric('Animation duration', round(a.stats.durationSeconds), round(b.stats.durationSeconds), 's'),
  ];

  const names = new Set([
    ...a.animations.map((animation) => animation.name.toLowerCase()),
    ...b.animations.map((animation) => animation.name.toLowerCase()),
  ]);
  const animations: AnimationDiff[] = [...names].map((name) => {
    const aAnim = a.animations.find((animation) => animation.name.toLowerCase() === name);
    const bAnim = b.animations.find((animation) => animation.name.toLowerCase() === name);
    return {
      name: aAnim?.name ?? bAnim?.name ?? name,
      aFrames: aAnim?.totalFrames ?? null,
      bFrames: bAnim?.totalFrames ?? null,
      aDelay: aAnim?.totalDelay ?? null,
      bDelay: bAnim?.totalDelay ?? null,
      aDamage: aAnim?.totalDamage ?? null,
      bDamage: bAnim?.totalDamage ?? null,
      aHits: aAnim?.totalHits ?? null,
      bHits: bAnim?.totalHits ?? null,
      changed:
        !aAnim ||
        !bAnim ||
        aAnim.totalFrames !== bAnim.totalFrames ||
        aAnim.totalDelay !== bAnim.totalDelay ||
        aAnim.totalDamage !== bAnim.totalDamage ||
        aAnim.totalHits !== bAnim.totalHits,
    };
  });

  return {
    header,
    changedHeaders: header.filter((entry) => entry.changed),
    metrics,
    animations,
    nameA: a.name ?? 'Untitled',
    nameB: b.name ?? 'Untitled',
  };
}

export function diffStats(a: AnimationStats, b: AnimationStats): {
  damage: number;
  delay: number;
  frames: number;
  hits: number;
  maxHit: number;
} {
  return {
    damage: b.totalDamage - a.totalDamage,
    delay: b.totalDelay - a.totalDelay,
    frames: b.totalFrames - a.totalFrames,
    hits: b.totalHits - a.totalHits,
    maxHit: b.maxHit - a.maxHit,
  };
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percentChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return round(((to - from) / Math.abs(from)) * 100);
}

export const SEVERITY_LABEL: Record<'error' | 'warning' | 'info', string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export function distribution(
  values: number[],
  buckets = 6,
): { label: string; count: number; from: number; to: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: String(min), count: values.length, from: min, to: max }];
  const width = (max - min) / buckets;
  return Array.from({ length: buckets }, (_, index) => {
    const from = min + width * index;
    const to = index === buckets - 1 ? max : min + width * (index + 1);
    const count = values.filter((value) =>
      index === buckets - 1 ? value >= from && value <= to : value >= from && value < to,
    ).length;
    return {
      label: `${Math.round(from)}–${Math.round(to)}`,
      count,
      from,
      to,
    };
  });
}
