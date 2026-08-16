import { describe, expect, it } from 'vitest';
import { CATALOG_MODELS } from '../domain/catalog';
import { estimateRepairPrice, repairModels, repairServices } from './pricing';

describe('repair pricing engine', () => {
  it('exposes catalog models for the wizard', () => {
    expect(repairModels()).toEqual([...CATALOG_MODELS]);
  });

  it('keeps repairServices as the single price source', () => {
    expect(repairServices.length).toBeGreaterThan(0);
    const screen = repairServices.find(
      (r) => r.model === 'iPhone 15 Pro' && r.service === 'screen',
    );
    expect(screen?.priceFrom).toBe(699);
  });

  it('returns „od X zł” when a service has a floor price', () => {
    const est = estimateRepairPrice('iPhone 14', ['battery']);
    expect(est.hasPricedService).toBe(true);
    expect(est.label).toMatch(/^od \d/);
    expect(est.priceFrom).toBeGreaterThan(0);
  });

  it('returns individual pricing when no floor is defined', () => {
    const est = estimateRepairPrice('iPhone 13', ['liquid', 'other']);
    expect(est.hasPricedService).toBe(false);
    expect(est.label).toContain('indywidualnie');
  });

  it('uses model-specific screen floor for Pro models', () => {
    const base = estimateRepairPrice('iPhone 14', ['screen']);
    const pro = estimateRepairPrice('iPhone 15 Pro', ['screen']);
    expect(pro.priceFrom).toBeGreaterThan(base.priceFrom ?? 0);
    expect(pro.label).toBe('od 699 zł');
  });
});
