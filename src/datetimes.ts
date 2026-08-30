import { format, fromUnixTime, getUnixTime } from "date-fns";

export function humanizeDate(unixdate: number) {
  return format(fromUnixTime(unixdate), "dd-MMM-yyyy");
}

export function dateToUnix(jsDate: Date): number {
  return getUnixTime(jsDate);
}

export function unixToDate(date: number): Date {
  return fromUnixTime(date);
}

// No months: they aren't a fixed number of days, so "3 months" would mean different spans
// depending on where in the year the range fell.
const DAYS_PER_YEAR = 365;
const DAYS_PER_WEEK = 7;

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function humanizeDays(days: number): string {
  const years = Math.floor(days / DAYS_PER_YEAR);
  const daysAfterYears = days % DAYS_PER_YEAR;
  const weeks = Math.floor(daysAfterYears / DAYS_PER_WEEK);
  const remainingDays = daysAfterYears % DAYS_PER_WEEK;

  const parts = [
    years > 0 ? pluralize(years, "year") : undefined,
    weeks > 0 ? pluralize(weeks, "week") : undefined,
    remainingDays > 0 ? pluralize(remainingDays, "day") : undefined,
  ].filter((part) => part !== undefined);

  // an exact zero has no parts at all, and an empty string reads as a rendering failure
  return parts.length > 0 ? parts.join(", ") : pluralize(days, "day");
}
