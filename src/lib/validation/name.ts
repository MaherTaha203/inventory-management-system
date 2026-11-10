import { z } from "zod";

/**
 * Conservative Arabic-aware comparison key.
 * It intentionally does not equate ة/ه or ى/ي.
 */
export function normalizeNameForMatch(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .trim()
    .replace(/\s+/g, " ");
}

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "الاسم مطلوب.")
  .refine((value) => normalizeNameForMatch(value).length > 0, "الاسم مطلوب.");

export function findNameMatches<T extends { name: string }>(
  input: string,
  candidates: readonly T[],
): T[] {
  const key = normalizeNameForMatch(input);
  if (!key) return [];
  return candidates.filter((candidate) => normalizeNameForMatch(candidate.name) === key);
}
