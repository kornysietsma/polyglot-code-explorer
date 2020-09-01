import moment from "moment";

export function humanizeDate(unixdate) {
  return moment.unix(unixdate).format("DD-MMM-YYYY");
}

export function dateToUnix(jsDate) {
  return moment(jsDate).unix();
}

export function unixToDate(date) {
  return moment.unix(date).toDate();
}

export function humanizeDays(days) {
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
