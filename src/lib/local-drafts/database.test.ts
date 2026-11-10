import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalDraft, OperationKind } from "@/types/domain";
import {
  deleteLocalDraftDatabase,
  LocalDraftRepository,
} from "./database";

const databases: string[] = [];
const repositories: LocalDraftRepository[] = [];

function setup() {
  const name = `draft-tests-${crypto.randomUUID()}`;
  databases.push(name);
  const repository = new LocalDraftRepository(name);
  repositories.push(repository);
  return repository;
}

function draft(operation: OperationKind, marker: string): LocalDraft<{ marker: string }> {
  return {
    schemaVersion: 1,
    operation,
    updatedAt: "2026-11-10T12:00:00.000Z",
    payload: { marker },
  };
}

afterEach(async () => {
  for (const repository of repositories.splice(0)) repository.close();
  for (const name of databases.splice(0)) await deleteLocalDraftDatabase(name);
});

describe("LocalDraftRepository", () => {
  it("keeps stocktake and receipt drafts independent", async () => {
    const repository = setup();
    await repository.save(draft("stocktake", "stock"));
    await repository.save(draft("receipt", "receipt"));

    expect((await repository.get<{ marker: string }>("stocktake"))?.payload.marker).toBe("stock");
    expect((await repository.get<{ marker: string }>("receipt"))?.payload.marker).toBe("receipt");
    expect(await repository.list()).toHaveLength(2);
  });

  it("does not replace an existing draft when creating a new operation", async () => {
    const repository = setup();
    await repository.save(draft("stocktake", "first"));

    const result = await repository.create(draft("stocktake", "second"));

    expect(result.created).toBe(false);
    if (!result.created) expect(result.existing.payload.marker).toBe("first");
  });

  it("creates a draft when none exists", async () => {
    const repository = setup();
    const result = await repository.create(draft("receipt", "new"));

    expect(result.created).toBe(true);
    expect((await repository.get<{ marker: string }>("receipt"))?.payload.marker).toBe("new");
  });

  it("retains a draft until explicit deletion after central save", async () => {
    const repository = setup();
    await repository.save(draft("receipt", "pending"));

    expect(await repository.get("receipt")).not.toBeNull();
    await repository.removeAfterCentralSave("receipt");
    expect(await repository.get("receipt")).toBeNull();
  });

  it("deletes only the selected operation draft", async () => {
    const repository = setup();
    await repository.save(draft("stocktake", "stock"));
    await repository.save(draft("receipt", "receipt"));

    await repository.delete("stocktake");

    expect(await repository.get("stocktake")).toBeNull();
    expect(await repository.get("receipt")).not.toBeNull();
  });
});
