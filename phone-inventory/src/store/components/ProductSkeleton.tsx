export function ProductSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="sf-product-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sf-skel-card">
          <div className="sf-skel sf-skel-media" />
          <div className="sf-skel-body">
            <div className="sf-skel sf-skel-line w70" />
            <div className="sf-skel sf-skel-line w50" />
            <div className="sf-skel sf-skel-line w40" />
            <div className="sf-skel sf-skel-line w55" />
            <div className="sf-skel sf-skel-btn" />
          </div>
        </div>
      ))}
    </div>
  );
}
