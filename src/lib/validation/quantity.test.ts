import { describe, expect, it } from "vitest";
import { quantityTextSchema } from "./quantity";

describe("quantityTextSchema", () => {
  it("accepts positive values with up to two decimal places", () => {
    expect(quantityTextSchema({ allowZero: false }).safeParse("12").success).toBe(true);
    expect(quantityTextSchema({ allowZero: false }).safeParse("12.25").success).toBe(true);
  });

  it("allows zero only when configured", () => {
    expect(quantityTextSchema({ allowZero: true }).safeParse("0").success).toBe(true);
    expect(quantityTextSchema({ allowZero: false }).safeParse("0").success).toBe(false);
  });

  it("rejects negatives, comma decimals, and more than two decimal places", () => {
    const schema = quantityTextSchema({ allowZero: true });
    expect(schema.safeParse("-1").success).toBe(false);
    expect(schema.safeParse("1,5").success).toBe(false);
    expect(schema.safeParse("1.234").success).toBe(false);
  });
});
