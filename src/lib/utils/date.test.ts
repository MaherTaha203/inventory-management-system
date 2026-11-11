import { describe, expect, it } from "vitest";
import { formatISODate, getTodayISODate } from "./date";

describe("date utilities", () => {
  it("formats ISO dates without timezone conversion", () => {
    expect(formatISODate("2026-03-07")).toBe("07/03/2026");
  });

  it("returns a local ISO date", () => {
    expect(getTodayISODate(new Date(2026, 0, 9, 23, 59))).toBe("2026-01-09");
  });
});
