/** Map iPhone model name → shared catalog product photo. */

const GENERATION_RE = /\biphone\s*(1[1-7])\b/i;

/**
 * Returns public path for the generation photo asset, e.g. `/products/iphone-15.webp`.
 * Pro / Plus / Mini / Pro Max share the same generation image for visual consistency.
 */
export function productImageForModel(modelName: string): string | null {
  const match = modelName.match(GENERATION_RE);
  if (!match) return null;
  return `/products/iphone-${match[1]}.webp`;
}

export function defaultImagesForModel(modelName: string): string[] {
  const src = productImageForModel(modelName);
  return src ? [src] : [];
}
