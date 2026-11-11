import { describe, expect, it } from "vitest";
import { displayNameSchema, findNameMatches, normalizeNameForMatch } from "./name";

describe("name normalization", () => {
  it("normalizes whitespace, diacritics and alef variants", () => {
    expect(normalizeNameForMatch("  أَحْمَد   إبراهيم ")).toBe("احمد ابراهيم");
  });

  it("does not equate taa marbuta with haa or alif maqsura with yaa", () => {
    expect(normalizeNameForMatch("مدرسة")).not.toBe(normalizeNameForMatch("مدرسه"));
    expect(normalizeNameForMatch("هدى")).not.toBe(normalizeNameForMatch("هدي"));
  });

  it("requires a non-empty display name", () => {
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
    expect(displayNameSchema.safeParse("صنف").success).toBe(true);
  });

  it("returns all normalized matches without silently choosing one", () => {
    const candidates = [{ name: "إبراهيم" }, { name: "ابراهيم" }, { name: "إبراهـيم" }];
    expect(findNameMatches("ابراهيم", candidates)).toHaveLength(3);
  });
});
