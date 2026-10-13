import { getDayOffset, type DateRange } from "../format";
import type { Locale } from "../i18n";

function capitalize(value: string, locale: Locale): string {
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
}

export function formatDistributionDate(iso: string, locale: Locale, includeWeekday = true): string {
  const date = new Date(`${iso}T12:00:00`);
  const part = (options: Intl.DateTimeFormatOptions) =>
    capitalize(new Intl.DateTimeFormat(locale, options).format(date).replace(/\./g, ""), locale);
  const dayMonth = `${part({ day: "2-digit" })} ${part({ month: "short" })}`;
  return includeWeekday ? `${part({ weekday: "short" })}, ${dayMonth}` : dayMonth;
}

export function formatDistributionPeriod(range: DateRange, locale: Locale): string {
  const start = new Date(`${range.startDate}T12:00:00`);
  const end = new Date(`${range.endDate}T12:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const weekly = getDayOffset(range.startDate, range.endDate) === 6;
  const month = (date: Date) =>
    capitalize(new Intl.DateTimeFormat(locale, { month: "long" }).format(date), locale);
  const date = (value: Date) =>
    `${value.getDate()} de ${month(value)}${sameYear ? "" : ` de ${value.getFullYear()}`}`;
  if (locale === "pt-BR") {
    if (range.startDate === range.endDate) return date(start);
    return `${weekly ? "Semana de " : ""}${sameMonth ? start.getDate() : date(start)} a ${date(end)}`;
  }
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(!sameYear ? { year: "numeric" } : {}),
  });
  return `${weekly ? "Week of " : ""}${formatter.formatRange(start, end)}`;
}

export function distributionHourScale(maxSeconds: number) {
  // DEV uses six intervals of whole hours; increase the step for larger totals.
  const minimumStep = Math.max(2, maxSeconds / 3600 / 6);
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= minimumStep)! * magnitude;
  const ticks = Array.from({ length: 7 }, (_, index) => index * step * 3600);
  return { ticks, maximum: step * 6 * 3600 };
}
