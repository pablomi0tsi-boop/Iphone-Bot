import { describe, expect, it } from 'vitest';
import { CATALOG_MODELS, modelIdFromName } from '../domain/catalog';
import {
  PRODUCT_IMAGE_BY_MODEL,
  allProductImagePaths,
  defaultImagesForModel,
  productImageForModel,
} from './productImages';

describe('productImageForModel — exact 1:1 mapping', () => {
  it('maps every catalog model to its own unique asset path', () => {
    const paths = CATALOG_MODELS.map((name) => productImageForModel(name));
    expect(paths.every(Boolean)).toBe(true);
    expect(new Set(paths).size).toBe(CATALOG_MODELS.length);
  });

  it('never shares one image across different models', () => {
    expect(productImageForModel('iPhone 17 Pro Max')).toBe(
      '/products/iphone-17-pro-max.webp',
    );
    expect(productImageForModel('iPhone 15 Pro')).toBe(
      '/products/iphone-15-pro.webp',
    );
    expect(productImageForModel('iPhone 17 Pro Max')).not.toBe(
      productImageForModel('iPhone 15 Pro'),
    );
    expect(productImageForModel('iPhone 16 Pro')).not.toBe(
      productImageForModel('iPhone 15 Pro'),
    );
  });

  it('uses modelIdFromName slug for each file', () => {
    for (const name of CATALOG_MODELS) {
      const slug = modelIdFromName(name);
      expect(PRODUCT_IMAGE_BY_MODEL[name]).toBe(`/products/${slug}.webp`);
      expect(defaultImagesForModel(name)).toEqual([`/products/${slug}.webp`]);
    }
  });

  it('returns null for non-iPhone models', () => {
    expect(productImageForModel('Samsung Galaxy')).toBeNull();
    expect(defaultImagesForModel('Samsung Galaxy')).toEqual([]);
  });

  it('exposes all expected paths', () => {
    expect(allProductImagePaths()).toHaveLength(CATALOG_MODELS.length);
  });
});
