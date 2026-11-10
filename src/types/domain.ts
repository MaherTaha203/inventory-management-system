/**
 * Shared domain contracts.
 *
 * These types describe business records only. Persistence-specific fields and
 * Supabase response shapes must stay outside this module.
 */

export type ISODate = `${number}-${number}-${number}`;
export type DecimalText = string;
export type RecordId = string;

export type OperationKind = "stocktake" | "receipt";

export interface CatalogItem {
  id: RecordId;
  name: string;
  isArchived: boolean;
}

export interface Supplier {
  id: RecordId;
  name: string;
  isArchived: boolean;
}

export interface MeasurementUnit {
  id: RecordId;
  name: string;
  isArchived: boolean;
}

export interface OperationLine {
  id: RecordId;
  itemId: RecordId | null;
  itemName: string;
  quantity: DecimalText;
  unitId: RecordId | null;
  unitName: string | null;
}

export interface StocktakeRecord {
  id: RecordId;
  number: string;
  date: ISODate;
  lines: OperationLine[];
}

export interface ReceiptRecord {
  id: RecordId;
  number: string;
  date: ISODate;
  supplierId: RecordId | null;
  supplierName: string | null;
  lines: OperationLine[];
}

export interface LocalDraft<T> {
  schemaVersion: 1;
  operation: OperationKind;
  updatedAt: string;
  payload: T;
}

export type SortDirection = "asc" | "desc";

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  rows: T[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}
