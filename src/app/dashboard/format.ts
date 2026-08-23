/** Date rendering helpers for donor surfaces (dates only — no clinical times). */

const dateFmt = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDate(value: Date): string {
  return dateFmt.format(value);
}

export function fmtDateTime(value: Date): string {
  return dateTimeFmt.format(value);
}
