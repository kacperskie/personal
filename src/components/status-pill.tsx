const toneClasses = {
  good: "bg-moss/10 text-moss",
  neutral: "bg-ink/10 text-ink",
  warning: "bg-saffron/10 text-saffron",
  risk: "bg-berry/10 text-berry",
};

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof toneClasses;
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
