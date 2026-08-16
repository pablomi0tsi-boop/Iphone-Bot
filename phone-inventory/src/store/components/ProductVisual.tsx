import type { StoreProduct } from '../types';

/** Abstract product visual — no stock photos required. */
export function ProductVisual({
  product,
  large = false,
}: {
  product: StoreProduct;
  large?: boolean;
}) {
  const hue = hueForModel(product.modelName);
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

function hueForModel(modelName: string): number {
  let hash = 0;
  for (let i = 0; i < modelName.length; i += 1) {
    hash = (hash * 31 + modelName.charCodeAt(i)) % 360;
  }
  return 140 + (hash % 40);
}
