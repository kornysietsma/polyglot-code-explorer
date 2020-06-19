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