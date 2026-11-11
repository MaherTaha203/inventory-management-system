import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type DatabaseError = {
  message: string;
  code?: string;
};

export type DatabaseResult = {
  data: unknown;
  error: DatabaseError | null;
  count?: number | null;
};

export type DatabaseQuery = PromiseLike<DatabaseResult> & {
  select(
    columns: string,
    options?: { count?: "exact" },
  ): DatabaseQuery;
  insert(values: Record<string, unknown>): DatabaseQuery;
  update(values: Record<string, unknown>): DatabaseQuery;
  eq(column: string, value: unknown): DatabaseQuery;
  is(column: string, value: null): DatabaseQuery;
  gte(column: string, value: string): DatabaseQuery;
  lte(column: string, value: string): DatabaseQuery;
  ilike(column: string, value: string): DatabaseQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): DatabaseQuery;
  range(from: number, to: number): DatabaseQuery;
  single(): Promise<DatabaseResult>;
  maybeSingle(): Promise<DatabaseResult>;
};

export type PrivilegedDatabaseClient = {
  from(table: string): DatabaseQuery;
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<DatabaseResult>;
};

export function getPrivilegedDatabaseClient(): PrivilegedDatabaseClient {
  return createSupabaseAdminClient() as unknown as PrivilegedDatabaseClient;
}
