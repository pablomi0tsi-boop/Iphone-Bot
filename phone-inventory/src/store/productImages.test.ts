import { describe, expect, it } from 'vitest';
import { defaultImagesForModel, productImageForModel } from './productImages';

describe('productImageForModel', () => {
  it('maps generations 11–17 to shared catalog assets', () => {
    expect(productImageForModel('iPhone 11')).toBe('/products/iphone-11.webp');
    expect(productImageForModel('iPhone 15 Pro')).toBe(
      '/products/iphone-15.webp',
    );
    expect(productImageForModel('iPhone 17 Pro Max')).toBe(
      '/products/iphone-17.webp',
    );
  });

  it('returns empty images for unknown models', () => {
    expect(productImageForModel('Samsung Galaxy')).toBeNull();
    expect(defaultImagesForModel('Samsung Galaxy')).toEqual([]);
  });
});
