export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}
