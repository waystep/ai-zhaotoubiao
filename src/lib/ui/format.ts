export function formatDateCN(dateLike: string | number | Date): string {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN");
}

export function formatCurrencyCNY(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  // 保留两位小数 + 千分位
  return `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function clampPercent(p: number | null | undefined): number {
  if (p == null || Number.isNaN(p)) return 0;
  return Math.min(100, Math.max(0, Math.round(p)));
}

