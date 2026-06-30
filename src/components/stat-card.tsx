import type { LucideIcon } from "lucide-react";

const toneClasses = {
  teal: "bg-teal/10 text-teal",
  moss: "bg-moss/10 text-moss",
  saffron: "bg-saffron/10 text-saffron",
  berry: "bg-berry/10 text-berry",
};

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: keyof typeof toneClasses;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink/60">{label}</p>
          <p className="mt-3 break-words text-3xl font-semibold text-ink">{value}</p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-sm leading-5 text-ink/60">{detail}</p>
    </article>
  );
}
