export function toMonthDate(month: string): string {
  return `${month.slice(0, 7)}-01`;
}

export function monthInputValue(dateValue: string): string {
  return dateValue.slice(0, 7);
}

export function addMonths(dateValue: string, months: number): string {
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function formatMonth(dateValue: string, locale = "en-GB"): string {
  return new Date(`${dateValue.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function dueDateForMonth(month: string, dueDay: number): string {
  const safeDay = Math.min(Math.max(Number(dueDay || 1), 1), 28);
  return `${month.slice(0, 8)}${String(safeDay).padStart(2, "0")}`;
}

export function isLatePayment(status: string, month: string, dueDay: number, now = new Date()): boolean {
  if (status !== "unpaid") return false;
  const dueDate = new Date(`${dueDateForMonth(month, dueDay)}T23:59:59Z`);
  return now.getTime() > dueDate.getTime();
}

export function currentMonthDate(): string {
  return new Date().toISOString().slice(0, 7) + "-01";
}
