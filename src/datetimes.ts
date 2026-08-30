import { fromUnixTime, getUnixTime } from "date-fns";

/**
 * Every date in the app is UTC — see `docs/dates-and-timezones.md`. date-fns's `format` used the
 * machine's local time, so on any machine behind UTC the scanner's day-aligned timestamps
 * rendered as the previous day: 1554768000 showed as 08-Apr-2019 in `America/New_York`.
 *
 * The locale is `en-US` deliberately, and not `en-GB` despite this being a UK tool: en-GB
 * abbreviates September as "Sept", which would quietly change the output. en-US matches
 * date-fns's `MMM` for all twelve months, so this reformatting changes nothing but the timezone.
 *
 * Built once — constructing an `Intl.DateTimeFormat` is far more expensive than using one.
 */
const utcDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function humanizeDate(unixdate: number) {
  const parts = new Map(
    utcDateFormat
      .formatToParts(fromUnixTime(unixdate))
      .map((part) => [part.type, part.value])
  );
  return `${parts.get("day")}-${parts.get("month")}-${parts.get("year")}`;
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
