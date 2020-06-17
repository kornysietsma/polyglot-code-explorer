import moment from "moment";

export function humanizeDate(unixdate) {
  return moment.unix(unixdate).format("DD-MMM-YYYY");
}
