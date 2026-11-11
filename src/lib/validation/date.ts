import { z } from "zod";

export interface DateValidationOptions {
  /** Local calendar date used as "today"; injectable for deterministic tests. */
  today?: Date;
}

function isValidCalendarDate(day: number, month: number, year: number): boolean {
  const candidate = new Date(year, month - 1, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

function subtractOneCalendarYear(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setFullYear(result.getFullYear() - 1);
  return result;
}

function toLocalDateKey(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Accepts DD/MM/YYYY using western digits only and returns the same text. */
export function operationDateSchema(options: DateValidationOptions = {}) {
  return z
    .string()
    .regex(/^\d{2}\/\d{2}\/\d{4}$/, "أدخل التاريخ بصيغة يوم/شهر/سنة.")
    .refine((value) => {
      const [day, month, year] = value.split("/").map(Number);
      return isValidCalendarDate(day, month, year);
    }, "التاريخ غير صحيح.")
    .refine((value) => {
      const [day, month, year] = value.split("/").map(Number);
      const today = options.today ?? new Date();
      const entered = new Date(year, month - 1, day);
      return toLocalDateKey(entered) <= toLocalDateKey(today);
    }, "لا يمكن إدخال تاريخ مستقبلي.")
    .refine((value) => {
      const [day, month, year] = value.split("/").map(Number);
      const today = options.today ?? new Date();
      const entered = new Date(year, month - 1, day);
      return toLocalDateKey(entered) >= toLocalDateKey(subtractOneCalendarYear(today));
    }, "لا يمكن أن يسبق التاريخ سنة واحدة.");
}

export function parseDisplayDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!isValidCalendarDate(day, month, year)) return null;
  return `${yearText}-${monthText}-${dayText}`;
}
