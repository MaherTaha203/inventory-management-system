import type { ISODate } from "@/types/domain";

/** Converts a valid ISO calendar date to DD/MM/YYYY without timezone shifts. */
export function formatISODate(date: ISODate): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Returns today's local calendar date as YYYY-MM-DD. */
export function getTodayISODate(now: Date = new Date()): ISODate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as ISODate;
}
