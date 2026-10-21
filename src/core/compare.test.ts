import { describe, expect, it } from 'vitest';
import { compareModels, diffStats, distribution, percentChange, round } from './compare';
import { parseModel } from './parser';
import { setHeaderField } from './editor';
import { bruteRaw, knightRaw } from '../test/fixtures';

describe('compareModels', () => {
  it('compares two real entities field by field', () => {
    const comparison = compareModels(parseModel(knightRaw), parseModel(bruteRaw));
    expect(comparison.nameA).toBe('Knight');
    expect(comparison.nameB).toBe('Brute');
    expect(comparison.changedHeaders.find((entry) => entry.key === 'health')).toMatchObject({
      a: '240',
      b: '360',
    });
    expect(comparison.header.find((entry) => entry.key === 'custom_note')?.changed).toBe(true);
    expect(comparison.header.some((entry) => entry.key === 'load' && !entry.changed)).toBe(true);
    const health = comparison.metrics.find((metric) => metric.label === 'Health');
    expect(health).toMatchObject({ a: 240, b: 360 });
    expect(comparison.metrics.find((metric) => metric.label === 'Attack damage')).toMatchObject({
      a: 104,
      b: 48,
    });
    expect(comparison.animations.find((animation) => animation.name === 'attack1')?.changed).toBe(true);
  });

  it('detects a single revision change', () => {
    const edited = setHeaderField(knightRaw, 'health', ['300']);
    const comparison = compareModels(parseModel(knightRaw), parseModel(edited));
    expect(comparison.changedHeaders).toHaveLength(1);
    expect(comparison.changedHeaders[0]).toMatchObject({ key: 'health', a: '240', b: '300' });
    expect(comparison.animations.every((animation) => !animation.changed)).toBe(true);
  });

  it('reports removed animations and zeroes for missing sides', () => {
    const edited = knightRaw.slice(0, knightRaw.indexOf('anim run'));
    const comparison = compareModels(parseModel(knightRaw), parseModel(edited));
    const run = comparison.animations.find((animation) => animation.name === 'run');
    expect(run).toMatchObject({ aFrames: 4, bFrames: null, changed: true });
  });
});

describe('stat helpers', () => {
  it('diffs stats and calculates percentages safely', () => {
    expect(
      diffStats(
        { totalFrames: 2, totalDelay: 10, totalDamage: 30, totalHits: 1, maxHit: 30, attackFrames: 1, durationSeconds: 0.1 },
        { totalFrames: 4, totalDelay: 25, totalDamage: 50, totalHits: 2, maxHit: 40, attackFrames: 2, durationSeconds: 0.25 },
      ),
    ).toEqual({ damage: 20, delay: 15, frames: 2, hits: 1, maxHit: 10 });
    expect(percentChange(240, 360)).toBe(50);
    expect(percentChange(300, 240)).toBe(-20);
    expect(percentChange(0, 10)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
    expect(round(1.23456)).toBe(1.23);
  });

  it('buckets a distribution without losing values', () => {
    const buckets = distribution([1, 2, 3, 4, 5, 6, 7], 3);
    expect(buckets).toHaveLength(3);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(7);
    expect(distribution([5, 5], 4)).toEqual([
      { label: '5', count: 2, from: 5, to: 5 },
    ]);
  });
});
