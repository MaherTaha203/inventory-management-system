import { describe, expect, it } from "vitest";
import { validateOperationDraft } from "./operation-draft";
import type { OperationDraftPayload } from "@/lib/local-drafts/draft-factory";

const today = new Date(2026, 10, 11);
function payload(overrides: Partial<OperationDraftPayload> = {}): OperationDraftPayload {
  return {
    date: "11/11/2026",
    lines: [{ id: "line-1", itemId: "00000000-0000-4000-8000-000000000001", itemName: "سكر", quantity: "2", unitId: "00000000-0000-4000-8000-000000000002", unitName: "كغم" }],
    ...overrides,
  };
}

describe("validateOperationDraft", () => {
  it("accepts a valid stocktake with zero quantity", () => {
    const result = validateOperationDraft("stocktake", payload({ lines: [{ ...payload().lines[0], quantity: "0" }] }), today);
    expect(result.valid).toBe(true);
  });

  it("rejects zero quantity for receipts", () => {
    const result = validateOperationDraft("receipt", payload({ lines: [{ ...payload().lines[0], quantity: "0" }] }), today);
    expect(result.errors.lines["line-1"]?.quantity).toBeTruthy();
  });

  it("requires an item name and a valid date", () => {
    const result = validateOperationDraft("stocktake", payload({ date: "31/02/2026", lines: [{ ...payload().lines[0], itemName: "  " }] }), today);
    expect(result.errors.date).toBeTruthy();
    expect(result.errors.lines["line-1"]?.itemName).toBeTruthy();
  });

  it("requires a selected catalog item and selected nonempty unit", () => {
    const first = payload().lines[0];
    const missingItem = validateOperationDraft(
      "stocktake",
      payload({ lines: [{ ...first, itemId: null }] }),
      today,
    );
    const missingUnit = validateOperationDraft(
      "stocktake",
      payload({ lines: [{ ...first, unitId: null }] }),
      today,
    );
    expect(missingItem.errors.lines["line-1"]?.itemName).toBeTruthy();
    expect(missingUnit.errors.lines["line-1"]?.unitName).toBeTruthy();
  });

  it("allows an optional supplier name to remain empty", () => {
    const result = validateOperationDraft("receipt", payload({ supplierName: "" }), today);
    expect(result.valid).toBe(true);
  });

  it("warns for repeated item and unit pairs but not different units", () => {
    const first = payload().lines[0];
    const result = validateOperationDraft("stocktake", payload({
      lines: [
        first,
        { ...first, id: "line-2" },
        { ...first, id: "line-3", unitName: "قطعة" },
      ],
    }), today);
    expect(result.duplicateLineIds).toEqual(["line-2"]);
    expect(result.valid).toBe(true);
  });
});
