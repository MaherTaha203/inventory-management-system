import { normalizeNameForMatch } from "@/lib/validation/name";

export type CatalogKind = "items" | "suppliers" | "units";

export interface CatalogEntry {
  id: string;
  name: string;
  isArchived: boolean;
}

export interface CatalogNameResolution {
  kind: "new" | "matched" | "ambiguous";
  matches: CatalogEntry[];
}

export function searchCatalogNames(
  query: string,
  entries: readonly CatalogEntry[],
): CatalogEntry[] {
  const literal = query.trim();
  if (!literal) return [];
  return entries
    .filter((entry) => !entry.isArchived && entry.name.includes(literal))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export function resolveCatalogName(
  name: string,
  entries: readonly CatalogEntry[],
): CatalogNameResolution {
  const key = normalizeNameForMatch(name);
  if (!key) return { kind: "new", matches: [] };
  const matches = entries.filter((entry) => normalizeNameForMatch(entry.name) === key);
  if (matches.length === 0) return { kind: "new", matches: [] };
  return { kind: matches.length === 1 ? "matched" : "ambiguous", matches };
}

export function createCatalogEntry(name: string): CatalogEntry {
  return { id: crypto.randomUUID(), name: name.trim().replace(/\s+/g, " "), isArchived: false };
}
