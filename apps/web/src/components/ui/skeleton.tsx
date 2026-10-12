type SkeletonBlockProps = {
  className?: string;
  height?: number | string;
  width?: number | string;
};

function sizeStyle({ height, width }: SkeletonBlockProps) {
  return {
    ...(height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : {}),
    ...(width !== undefined ? { width: typeof width === "number" ? `${width}px` : width } : {})
  };
}

export function SkeletonBlock(props: SkeletonBlockProps) {
  return <span className={`skeleton-block ${props.className ?? ""}`} style={sizeStyle(props)} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <article className="skeleton-card">
      <SkeletonBlock className="skeleton-icon" />
      <SkeletonBlock height={18} width="58%" />
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock key={index} height={12} width={index === lines - 1 ? "42%" : "82%"} />
      ))}
    </article>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className={`skeleton-stats ${count === 3 ? "three" : ""}`}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} lines={2} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table" role="status" aria-label="Loading">
      <div className="skeleton-table-head" style={{ gridTemplateColumns: `repeat(${columns}, minmax(110px, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={index} height={16} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div className="skeleton-table-row" key={row} style={{ gridTemplateColumns: `repeat(${columns}, minmax(110px, 1fr))` }}>
          {Array.from({ length: columns }).map((_, column) => (
            <SkeletonBlock key={column} height={column === 0 ? 24 : 16} width={column === columns - 1 ? "55%" : "80%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({ fields = 8 }: { fields?: number }) {
  return (
    <div className="skeleton-form">
      {Array.from({ length: fields }).map((_, index) => (
        <label key={index} className={index % 5 === 0 ? "full" : ""}>
          <SkeletonBlock height={12} width="36%" />
          <SkeletonBlock height={44} />
        </label>
      ))}
    </div>
  );
}

export function SkeletonDashboardShell() {
  return (
    <div className="admin-shell restaurant-admin-shell skeleton-shell">
      <aside className="admin-sidebar">
        <SkeletonBlock className="skeleton-brand" />
        <nav>
          {Array.from({ length: 9 }).map((_, index) => (
            <SkeletonBlock key={index} height={48} />
          ))}
        </nav>
      </aside>
      <main className="admin-main restaurant-admin-main">
        <header className="admin-topbar restaurant-topbar">
          <SkeletonBlock height={46} width={156} />
          <SkeletonBlock height={46} width={46} />
          <SkeletonBlock height={46} width={280} />
        </header>
        <section className="products-header skeleton-page-head">
          <div>
            <SkeletonBlock height={14} width={88} />
            <SkeletonBlock height={34} width={260} />
            <SkeletonBlock height={16} width={420} />
          </div>
        </section>
        <SkeletonStats />
        <section className="data-card full">
          <SkeletonTable rows={7} columns={5} />
        </section>
      </main>
    </div>
  );
}

export function SkeletonPublicMenu() {
  return (
    <main className="public-screen skeleton-public-screen">
      <header className="public-header">
        <SkeletonBlock height={42} width={42} />
        <SkeletonBlock height={18} width={132} />
        <SkeletonBlock height={42} width={42} />
      </header>
      <section className="skeleton-public-hero">
        <SkeletonBlock height={18} width="45%" />
        <SkeletonBlock height={34} width="76%" />
        <SkeletonBlock height={14} width="88%" />
      </section>
      <div className="skeleton-public-chips">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} height={42} width={96} />
        ))}
      </div>
      <section className="skeleton-public-products">
        {Array.from({ length: 5 }).map((_, index) => (
          <article key={index}>
            <SkeletonBlock height={82} width={92} />
            <div>
              <SkeletonBlock height={16} width="62%" />
              <SkeletonBlock height={12} width="92%" />
              <SkeletonBlock height={14} width="34%" />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
