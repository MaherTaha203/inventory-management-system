import type { OperationKind } from "@/types/domain";
import type { OperationDraftPayload } from "@/lib/local-drafts/draft-factory";
import { operationDateSchema } from "./date";
import { displayNameSchema, normalizeNameForMatch } from "./name";
import { quantityTextSchema } from "./quantity";

export type DraftValidationErrors = {
  date?: string;
  supplierName?: string;
  lines: Record<string, { itemName?: string; quantity?: string }>;
};

export interface DraftValidationResult {
  valid: boolean;
  errors: DraftValidationErrors;
  duplicateLineIds: string[];
}

/**
 * Validates an operation draft without mutating or normalizing user-entered values.
 * Repeated item/unit pairs are allowed, but reported as warnings to the UI.
 */
export function validateOperationDraft(
  operation: OperationKind,
  payload: OperationDraftPayload,
  today?: Date,
): DraftValidationResult {
  const errors: DraftValidationErrors = { lines: {} };
  const dateResult = operationDateSchema({ today }).safeParse(payload.date);
  if (!dateResult.success) errors.date = dateResult.error.issues[0]?.message ?? "التاريخ غير صحيح.";

  if (operation === "receipt" && payload.supplierName?.trim()) {
    const supplierResult = displayNameSchema.safeParse(payload.supplierName);
    if (!supplierResult.success) {
      errors.supplierName = supplierResult.error.issues[0]?.message ?? "اسم المورد غير صحيح.";
    }
  }

  const seenPairs = new Set<string>();
  const duplicateLineIds = new Set<string>();

  for (const line of payload.lines) {
    const lineErrors: { itemName?: string; quantity?: string } = {};
    const itemResult = displayNameSchema.safeParse(line.itemName);
    if (!itemResult.success) {
      lineErrors.itemName = itemResult.error.issues[0]?.message ?? "اسم الصنف مطلوب.";
    }

    const quantityResult = quantityTextSchema({ allowZero: operation === "stocktake" }).safeParse(line.quantity);
    if (!quantityResult.success) {
      lineErrors.quantity = quantityResult.error.issues[0]?.message ?? "الكمية غير صحيحة.";
    }

    if (Object.keys(lineErrors).length > 0) errors.lines[line.id] = lineErrors;

    const itemKey = normalizeNameForMatch(line.itemName);
    const unitKey = normalizeNameForMatch(line.unitName ?? "");
    if (itemKey) {
      const pairKey = JSON.stringify([itemKey, unitKey]);
      if (seenPairs.has(pairKey)) duplicateLineIds.add(line.id);
      else seenPairs.add(pairKey);
    }
  }

  const valid = !errors.date && !errors.supplierName && Object.keys(errors.lines).length === 0;
  return { valid, errors, duplicateLineIds: [...duplicateLineIds] };
}
