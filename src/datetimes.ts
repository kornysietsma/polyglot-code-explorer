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

export function humanizeDays(days: number): string {
  let daysRemaining = days;
  let years = 0;
  let weeks = 0; // no months, as they are not really precise
  if (daysRemaining > 365) {
    years = Math.floor(daysRemaining / 365);
    daysRemaining %= 365;
  }
  if (daysRemaining > 7) {
    weeks = Math.floor(daysRemaining / 7);
    daysRemaining %= 7;
  }
  const yearText =
    years > 0 ? `${years} year${years > 1 ? "s" : ""}` : undefined;
  const weekText =
    weeks > 0 ? `${weeks} week${weeks > 1 ? "s" : ""}` : undefined;
  const dayText =
    daysRemaining > 0
      ? `${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`
      : undefined;
  return [yearText, weekText, dayText]
    .filter((t) => t !== undefined)
    .join(", ");
}
