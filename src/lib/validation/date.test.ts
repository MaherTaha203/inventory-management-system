import { describe, expect, it } from "vitest";
import { operationDateSchema, parseDisplayDate } from "./date";

const today = new Date(2026, 10, 10);

describe("operationDateSchema", () => {
  const schema = operationDateSchema({ today });

  it("accepts today and the one-year boundary", () => {
    expect(schema.safeParse("10/11/2026").success).toBe(true);
    expect(schema.safeParse("10/11/2025").success).toBe(true);
  });

  it("rejects future and older dates", () => {
    expect(schema.safeParse("11/11/2026").success).toBe(false);
    expect(schema.safeParse("09/11/2025").success).toBe(false);
  });

  it("rejects impossible dates and non-western date formats", () => {
    expect(schema.safeParse("31/02/2026").success).toBe(false);
    expect(schema.safeParse("١٠/١١/٢٠٢٦").success).toBe(false);
    expect(schema.safeParse("2026-11-10").success).toBe(false);
  });
});

describe("parseDisplayDate", () => {
  it("converts a valid display date to ISO", () => {
    expect(parseDisplayDate("07/03/2026")).toBe("2026-03-07");
  });

  it("returns null for invalid input", () => {
    expect(parseDisplayDate("31/02/2026")).toBeNull();
  });
});
