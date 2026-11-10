import { describe, expect, it } from "vitest";
import { normalizePageRequest, paginate } from "./pagination";

describe("pagination", () => {
  it("uses 20 rows by default and returns newest-first input unchanged", () => {
    const rows = Array.from({ length: 25 }, (_, index) => index + 1);
    const result = paginate(rows);
    expect(result.rows).toHaveLength(20);
    expect(result.rows[0]).toBe(1);
    expect(result.totalPages).toBe(2);
  });

  it("clamps invalid page values and limits page size", () => {
    expect(normalizePageRequest({ page: 0, pageSize: 500 })).toEqual({
      page: 1,
      pageSize: 100,
    });
  });

  it("returns an empty page beyond the last page", () => {
    expect(paginate([1, 2], { page: 3, pageSize: 1 }).rows).toEqual([]);
  });
});
