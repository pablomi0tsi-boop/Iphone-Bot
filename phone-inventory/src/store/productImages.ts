import { CATALOG_MODELS, modelIdFromName, normalizeModelName } from '../domain/catalog';

/**
 * Exact 1:1 catalog photo for each iPhone model.
 * Never share one asset across different models.
 */
export const PRODUCT_IMAGE_BY_MODEL: Record<string, string> = Object.fromEntries(
  CATALOG_MODELS.map((name) => {
    const slug = modelIdFromName(name);
    return [name, `/products/${slug}.webp`];
  }),
);

/** Public path for this exact model, or null if not an iPhone catalog model. */
export function productImageForModel(modelName: string): string | null {
  const normalized = normalizeModelName(modelName);
  return PRODUCT_IMAGE_BY_MODEL[normalized] ?? null;
}

export function defaultImagesForModel(modelName: string): string[] {
  const src = productImageForModel(modelName);
  return src ? [src] : [];
}

/** All expected asset paths (for verification scripts). */
export function allProductImagePaths(): string[] {
  return CATALOG_MODELS.map((name) => PRODUCT_IMAGE_BY_MODEL[name]);
}

export function productImageSlug(modelName: string): string | null {
  const path = productImageForModel(modelName);
  if (!path) return null;
  return path.replace(/^\/products\//, '').replace(/\.webp$/, '');
}
