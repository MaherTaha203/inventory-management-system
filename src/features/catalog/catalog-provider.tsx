"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createCatalogEntry, type CatalogEntry, type CatalogKind } from "./catalog";
import { displayNameSchema } from "@/lib/validation/name";

interface CatalogContextValue {
  entries: Record<CatalogKind, CatalogEntry[]>;
  add: (kind: CatalogKind, name: string) => CatalogEntry;
  rename: (kind: CatalogKind, id: string, name: string) => void;
  setArchived: (kind: CatalogKind, id: string, archived: boolean) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<CatalogKind, CatalogEntry[]>>({
    items: [],
    suppliers: [],
    units: [],
  });

  function add(kind: CatalogKind, name: string) {
    const parsed = displayNameSchema.parse(name);
    const entry = createCatalogEntry(parsed);
    setEntries((current) => ({ ...current, [kind]: [...current[kind], entry] }));
    return entry;
  }

  function rename(kind: CatalogKind, id: string, name: string) {
    const parsed = displayNameSchema.parse(name);
    setEntries((current) => ({
      ...current,
      [kind]: current[kind].map((entry) => entry.id === id ? { ...entry, name: parsed } : entry),
    }));
  }

  function setArchived(kind: CatalogKind, id: string, archived: boolean) {
    setEntries((current) => ({
      ...current,
      [kind]: current[kind].map((entry) => entry.id === id ? { ...entry, isArchived: archived } : entry),
    }));
  }

  const value = useMemo(() => ({ entries, add, rename, setArchived }), [entries]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used within CatalogProvider");
  return value;
}
