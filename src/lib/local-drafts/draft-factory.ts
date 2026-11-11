import type { LocalDraft, OperationKind } from "@/types/domain";

export interface DraftLine {
  id: string;
  itemId: string | null;
  itemName: string;
  quantity: string;
  unitId: string | null;
  unitName: string | null;
}

export interface OperationDraftPayload {
  date: string;
  lines: DraftLine[];
  supplierName?: string;
  supplierId?: string | null;
}

export function createOperationDraft<T extends OperationDraftPayload>(
  operation: OperationKind,
  payload: T,
  now: Date = new Date(),
): LocalDraft<T> {
  return {
    schemaVersion: 1,
    operation,
    updatedAt: now.toISOString(),
    payload: structuredClone(payload),
  };
}
