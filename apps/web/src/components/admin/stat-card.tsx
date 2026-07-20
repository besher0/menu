import { Banknote, LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  note,
  icon: Icon = Banknote
}: {
  label: string;
  value: string;
  note?: string;
  icon?: LucideIcon;
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {note ? <em>{note}</em> : null}
      </div>
      <span className="stat-icon">
        <Icon size={28} />
      </span>
    </section>
  );
}
