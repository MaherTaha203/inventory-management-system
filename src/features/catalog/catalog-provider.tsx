"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { CatalogEntry, CatalogKind } from "./catalog";

type CatalogApiEntry = {
  id: string;
  name: string;
  isArchived: boolean;
};

type CatalogApiErrorPayload = {
  error?: string;
  code?: string;
  matches?: CatalogApiEntry[];
  deletedSimilar?: CatalogApiEntry[];
};

export class CatalogApiError extends Error {
  code: string | null;
  matches: CatalogApiEntry[];
  deletedSimilar: CatalogApiEntry[];

  constructor(payload: CatalogApiErrorPayload) {
    super(payload.error ?? "تعذر تنفيذ العملية على القائمة.");
    this.name = "CatalogApiError";
    this.code = payload.code ?? null;
    this.matches = payload.matches ?? [];
    this.deletedSimilar = payload.deletedSimilar ?? [];
  }
}

interface CatalogContextValue {
  entries: Record<CatalogKind, CatalogEntry[]>;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  add: (
    kind: CatalogKind,
    name: string,
    confirmSimilar?: boolean,
  ) => Promise<CatalogEntry>;
  rename: (kind: CatalogKind, id: string, name: string) => Promise<void>;
  setArchived: (
    kind: CatalogKind,
    id: string,
    archived: boolean,
  ) => Promise<void>;
}

const emptyEntries: Record<CatalogKind, CatalogEntry[]> = {
  items: [],
  suppliers: [],
  units: [],
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

async function readError(response: Response): Promise<CatalogApiError> {
  const payload = (await response.json().catch(() => ({}))) as CatalogApiErrorPayload;
  return new CatalogApiError(payload);
}

async function loadKind(kind: CatalogKind): Promise<CatalogEntry[]> {
  const response = await fetch(`/api/catalog?kind=${kind}${kind === "units" ? "&includeInactive=true" : ""}`, {
    cache: "no-store",
  });
  if (!response.ok) throw await readError(response);

  const result = (await response.json()) as { entries: CatalogApiEntry[] };
  return result.entries;
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<CatalogKind, CatalogEntry[]>>(
    emptyEntries,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [items, suppliers, units] = await Promise.all([
        loadKind("items"),
        loadKind("suppliers"),
        loadKind("units"),
      ]);
      setEntries({ items, suppliers, units });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر تحميل القوائم من الخادم.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (
      kind: CatalogKind,
      name: string,
      confirmSimilar = false,
    ): Promise<CatalogEntry> => {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, confirmSimilar }),
      });
      if (!response.ok) throw await readError(response);

      const result = (await response.json()) as { entry: CatalogApiEntry };
      setEntries((current) => ({
        ...current,
        [kind]: [...current[kind], result.entry],
      }));
      return result.entry;
    },
    [],
  );

  const rename = useCallback(
    async (kind: CatalogKind, id: string, name: string): Promise<void> => {
      const response = await fetch("/api/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, name }),
      });
      if (!response.ok) throw await readError(response);

      const result = (await response.json()) as { entry: CatalogApiEntry };
      setEntries((current) => ({
        ...current,
        [kind]: current[kind].map((entry) =>
          entry.id === id ? result.entry : entry,
        ),
      }));
    },
    [],
  );

  const setArchived = useCallback(
    async (
      kind: CatalogKind,
      id: string,
      archived: boolean,
    ): Promise<void> => {
      if (kind === "units") {
        const response = await fetch("/api/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id, isActive: !archived }),
        });
        if (!response.ok) throw await readError(response);

        const result = (await response.json()) as { entry: CatalogApiEntry };
        setEntries((current) => ({
          ...current,
          units: current.units.map((entry) =>
            entry.id === id ? result.entry : entry,
          ),
        }));
        return;
      }

      if (!archived) return;
      const response = await fetch("/api/catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      if (!response.ok) throw await readError(response);

      setEntries((current) => ({
        ...current,
        [kind]: current[kind].filter((entry) => entry.id !== id),
      }));
    },
    [],
  );

  return (
    <CatalogContext.Provider
      value={{ entries, loading, error, refresh, add, rename, setArchived }}
    >
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used within CatalogProvider");
  return value;
}
