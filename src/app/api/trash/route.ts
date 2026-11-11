import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { hasSameOrigin } from "@/lib/auth/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const entryTypeSchema = z.enum(["stocktake", "receipt", "item", "supplier"]);

type TrashRow = {
  entry_type: z.infer<typeof entryTypeSchema>;
  entry_id: string;
  display_name: string;
  deleted_at: string;
  purge_at: string;
};

type DbError = { message: string };
type DbResult = { data: unknown; error: DbError | null; count?: number | null };

type QueryBuilder = PromiseLike<DbResult> & {
  select(columns: string, options?: { count?: "exact" }): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  ilike(column: string, value: string): QueryBuilder;
};

type RpcClient = {
  from(table: string): QueryBuilder;
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<DbResult>;
};

function getClient(): RpcClient {
  return createSupabaseAdminClient() as unknown as RpcClient;
}

export async function GET(request: NextRequest) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const page = Math.max(
    1,
    Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = 20;
  const typeParam = request.nextUrl.searchParams.get("type");
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (typeParam && !entryTypeSchema.safeParse(typeParam).success) {
    return NextResponse.json({ error: "نوع السجل غير صحيح." }, { status: 400 });
  }

  const client = getClient();
  let query = client
    .from("trash_entries")
    .select("entry_type, entry_id, display_name, deleted_at, purge_at", {
      count: "exact",
    })
    .order("deleted_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (typeParam) query = query.eq("entry_type", typeParam);
  if (search) query = query.ilike("display_name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: "تعذر تحميل سلة المحذوفات." }, { status: 500 });
  }

  const now = Date.now();
  const rows = ((data ?? []) as TrashRow[]).map((entry) => ({
    ...entry,
    daysRemaining: Math.max(
      0,
      Math.ceil((new Date(entry.purge_at).getTime() - now) / 86_400_000),
    ),
  }));

  return NextResponse.json({
    entries: rows,
    page,
    pageSize,
    totalRows: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z
    .object({
      action: z.enum(["restore", "purge"]),
      type: entryTypeSchema,
      id: z.string().uuid(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات العملية غير صحيحة." }, { status: 400 });
  }

  const functionName =
    parsed.data.action === "restore"
      ? "restore_trash_entry"
      : "purge_trash_entry";

  const { data, error } = await getClient().rpc(functionName, {
    p_entry_type: parsed.data.type,
    p_entry_id: parsed.data.id,
  });

  if (error) {
    return NextResponse.json({ error: "تعذر تنفيذ العملية." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json(
      {
        error:
          parsed.data.action === "restore"
            ? "انتهت مدة الاستعادة أو أن السجل غير موجود."
            : "السجل غير موجود في سلة المحذوفات.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
