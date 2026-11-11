import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LocalDraft, OperationKind } from "@/types/domain";

const DATABASE_NAME = "inventory-management-local";
const DATABASE_VERSION = 1;
const DRAFTS_STORE = "drafts";

interface LocalDraftDatabase extends DBSchema {
  drafts: {
    key: OperationKind;
    value: LocalDraft<unknown>;
  };
}

export type CreateDraftResult<T> =
  | { created: true; draft: LocalDraft<T> }
  | { created: false; existing: LocalDraft<T> };

export class LocalDraftStorageError extends Error {
  readonly causeValue: unknown;

  constructor(message: string, causeValue?: unknown) {
    super(message);
    this.name = "LocalDraftStorageError";
    this.causeValue = causeValue;
  }
}

/**
 * Per-browser IndexedDB repository. It stores exactly one draft per operation
 * type and never communicates with the central database.
 */
export class LocalDraftRepository {
  private databasePromise: Promise<IDBPDatabase<LocalDraftDatabase>> | null = null;

  constructor(private readonly databaseName = DATABASE_NAME) {}

  private database(): Promise<IDBPDatabase<LocalDraftDatabase>> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(
        new LocalDraftStorageError("التخزين المحلي غير متاح في هذا المتصفح."),
      );
    }

    if (!this.databasePromise) {
      this.databasePromise = openDB<LocalDraftDatabase>(
        this.databaseName,
        DATABASE_VERSION,
        {
          upgrade(database) {
            if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
              database.createObjectStore(DRAFTS_STORE);
            }
          },
        },
      ).catch((error: unknown) => {
        this.databasePromise = null;
        throw new LocalDraftStorageError("تعذر فتح مساحة المسودات المحلية.", error);
      });
    }

    return this.databasePromise;
  }

  async get<T>(operation: OperationKind): Promise<LocalDraft<T> | null> {
    try {
      const database = await this.database();
      return ((await database.get(DRAFTS_STORE, operation)) as LocalDraft<T> | undefined) ?? null;
    } catch (error) {
      if (error instanceof LocalDraftStorageError) throw error;
      throw new LocalDraftStorageError("تعذر قراءة المسودة المحلية.", error);
    }
  }

  /** Creates a new draft only if this operation has no existing draft. */
  async create<T>(draft: LocalDraft<T>): Promise<CreateDraftResult<T>> {
    this.assertDraft(draft);
    try {
      const database = await this.database();
      const transaction = database.transaction(DRAFTS_STORE, "readwrite");
      const store = transaction.objectStore(DRAFTS_STORE);
      const existing = (await store.get(draft.operation)) as LocalDraft<T> | undefined;

      if (existing) {
        await transaction.done;
        return { created: false, existing };
      }

      await store.add(draft as LocalDraft<unknown>, draft.operation);
      await transaction.done;
      return { created: true, draft };
    } catch (error) {
      if (error instanceof LocalDraftStorageError) throw error;
      throw new LocalDraftStorageError("تعذر إنشاء المسودة المحلية.", error);
    }
  }

  /** Explicitly updates the selected operation's existing draft. */
  async save<T>(draft: LocalDraft<T>): Promise<void> {
    this.assertDraft(draft);
    try {
      const database = await this.database();
      await database.put(DRAFTS_STORE, draft as LocalDraft<unknown>, draft.operation);
    } catch (error) {
      if (error instanceof LocalDraftStorageError) throw error;
      throw new LocalDraftStorageError("تعذر حفظ المسودة المحلية.", error);
    }
  }

  async list(): Promise<LocalDraft<unknown>[]> {
    try {
      const database = await this.database();
      return database.getAll(DRAFTS_STORE);
    } catch (error) {
      if (error instanceof LocalDraftStorageError) throw error;
      throw new LocalDraftStorageError("تعذر عرض المسودات المحلية.", error);
    }
  }

  async delete(operation: OperationKind): Promise<void> {
    try {
      const database = await this.database();
      await database.delete(DRAFTS_STORE, operation);
    } catch (error) {
      if (error instanceof LocalDraftStorageError) throw error;
      throw new LocalDraftStorageError("تعذر حذف المسودة المحلية.", error);
    }
  }

  /**
   * Call only after the central save has been confirmed successful.
   * A failed central save must never call this method.
   */
  async removeAfterCentralSave(operation: OperationKind): Promise<void> {
    await this.delete(operation);
  }

  close(): void {
    if (this.databasePromise) {
      void this.databasePromise.then((database) => database.close()).catch(() => undefined);
      this.databasePromise = null;
    }
  }

  private assertDraft<T>(draft: LocalDraft<T>): void {
    if (draft.schemaVersion !== 1) {
      throw new LocalDraftStorageError("إصدار المسودة غير مدعوم.");
    }
    if (draft.operation !== "stocktake" && draft.operation !== "receipt") {
      throw new LocalDraftStorageError("نوع المسودة غير صالح.");
    }
    if (!Number.isFinite(Date.parse(draft.updatedAt))) {
      throw new LocalDraftStorageError("وقت تحديث المسودة غير صالح.");
    }
  }
}

/** Test/support utility for explicitly removing a named local database. */
export async function deleteLocalDraftDatabase(databaseName: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await deleteDB(databaseName);
}
