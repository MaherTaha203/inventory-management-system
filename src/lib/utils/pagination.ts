import type { PageRequest, PageResult } from "@/types/domain";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePageRequest(request: Partial<PageRequest> = {}): PageRequest {
  const page = Number.isInteger(request.page) && (request.page ?? 0) > 0 ? request.page! : 1;
  const requestedSize = request.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize =
    Number.isInteger(requestedSize) && requestedSize > 0
      ? Math.min(requestedSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

export function paginate<T>(items: readonly T[], request: Partial<PageRequest> = {}): PageResult<T> {
  const normalized = normalizePageRequest(request);
  const totalRows = items.length;
  const totalPages = Math.ceil(totalRows / normalized.pageSize);
  const start = (normalized.page - 1) * normalized.pageSize;

  return {
    rows: items.slice(start, start + normalized.pageSize),
    ...normalized,
    totalRows,
    totalPages,
  };
}
