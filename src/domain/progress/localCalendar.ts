const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function localDateKey(value: Date | string, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(value)}`);
  }

  const parts = formatterFor(timeZone).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not resolve a local date in ${timeZone}.`);
  }
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function enumerateCalendarDays(endDate: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Calendar day count must be a non-negative integer.");
  }
  return Array.from({ length: count }, (_, index) => addCalendarDays(endDate, index - count + 1));
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}
