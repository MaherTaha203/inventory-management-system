import { describe, expect, it } from "vitest";
import { resolveCatalogName, searchCatalogNames, type CatalogEntry } from "./catalog";

const entries: CatalogEntry[] = [
  { id: "1", name: "إبراهيم", isArchived: false },
  { id: "2", name: "ابراهيم", isArchived: false },
  { id: "3", name: "إبراهيم قدورة", isArchived: false },
  { id: "4", name: "سكر", isArchived: true },
];

describe("catalog matching", () => {
  it("uses literal substring search and hides archived entries", () => {
    expect(searchCatalogNames("إب", entries).map((entry) => entry.id)).toEqual(["1", "3"]);
    expect(searchCatalogNames("سكر", entries)).toEqual([]);
  });

  it("returns all normalized matches for user selection", () => {
    const result = resolveCatalogName("ابراهيم", entries);
    expect(result.kind).toBe("ambiguous");
    expect(result.matches.map((entry) => entry.id)).toEqual(["1", "2"]);
  });

  it("does not equate taa marbuta with haa", () => {
    expect(resolveCatalogName("مدرسه", [{ id: "x", name: "مدرسة", isArchived: false }]).kind).toBe("new");
  });
});
