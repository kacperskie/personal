export function ProgressBar({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(value, 1));

  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-line"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue * 100)}
    >
      <div className="h-full rounded-full bg-teal" style={{ width: `${safeValue * 100}%` }} />
    </div>
  );
}
