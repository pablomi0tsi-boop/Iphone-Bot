import type { StoreProduct } from '../types';
import { productImageForModel } from '../productImages';

/**
 * Product photos must always match the catalog model.
 * Prefer the canonical per-model asset; never trust a mismatched image URL.
 */
export function ProductVisual({
  product,
  large = false,
}: {
  product: StoreProduct;
  large?: boolean;
}) {
  const catalogImage = productImageForModel(product.modelName);
  const stored = product.images.find((src) => Boolean(src));
  const image =
    catalogImage ??
    (stored && looksLikeMatchingModelAsset(stored, product.modelName)
      ? stored
      : null);
  const hue = hueForModel(product.modelName);

  if (image) {
    return (
      <div className={`sf-visual photo ${large ? 'large' : ''}`}>
        <img
          src={image}
          alt={`${product.modelName} — widok tył i przód`}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={`sf-visual ${large ? 'large' : ''}`}
      style={{ ['--sf-hue' as string]: String(hue) }}
      aria-hidden="true"
    >
      <div className="sf-visual-phone">
        <div className="sf-visual-screen" />
      </div>
      <span className="sf-visual-model">{product.modelName}</span>
    </div>
  );
}

function looksLikeMatchingModelAsset(src: string, modelName: string): boolean {
  const expected = productImageForModel(modelName);
  if (!expected) return false;
  return src === expected || src.endsWith(expected);
}

function hueForModel(modelName: string): number {
  let hash = 0;
  for (let i = 0; i < modelName.length; i += 1) {
    hash = (hash * 31 + modelName.charCodeAt(i)) % 360;
  }
  return 140 + (hash % 40);
}
