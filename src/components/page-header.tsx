export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-ink/65 sm:text-base">{description}</p>
    </div>
  );
}
