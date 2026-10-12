type ChartDatum = {
  label: string;
  value: number;
  color: string;
};

export function DonutChart({
  title,
  center,
  data,
  actionLabel = "جميع الفئات"
}: {
  title: string;
  center: string;
  data: ChartDatum[];
  actionLabel?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient =
    total > 0
      ? data
          .map((item) => {
            const start = cursor;
            const end = cursor + (item.value / total) * 100;
            cursor = end;
            return `${item.color} ${start}% ${end}%`;
          })
          .join(", ")
      : "#eef0f4 0% 100%";

  return (
    <section className="chart-card">
      <div className="section-head">
        <h2>{title}</h2>
        <button>{actionLabel}</button>
      </div>
      <div className="donut-layout">
        <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
          <span>{center}</span>
        </div>
        <ul className="legend-list">
          {data.map((item) => (
            <li key={item.label}>
              <span style={{ backgroundColor: item.color }} />
              <b>{item.label}</b>
              <small>{formatPercent(item.value, total)}</small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function BarChart({
  title = "الدخل حسب الباقة",
  actionLabel = "هذا الشهر",
  data
}: {
  title?: string;
  actionLabel?: string;
  data: ChartDatum[];
}) {
  const maxValue = Math.max(...data.map((bar) => bar.value), 1);

  return (
    <section className="chart-card">
      <div className="section-head">
        <h2>{title}</h2>
        <button>{actionLabel}</button>
      </div>
      <div className="bar-chart">
        {data.map((bar) => (
          <div key={bar.label} className="bar-item">
            <strong>{formatMoney(bar.value)}</strong>
            <span style={{ height: `${Math.max(38, (bar.value / maxValue) * 150)}px`, backgroundColor: bar.color }} />
            <small>{bar.label}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}$`;
}
