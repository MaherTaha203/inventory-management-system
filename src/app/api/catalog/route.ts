import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { hasSameOrigin } from "@/lib/auth/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  displayNameSchema,
  normalizeNameForMatch,
} from "@/lib/validation/name";

const catalogKindSchema = z.enum(["items", "suppliers", "units"]);

const createSchema = z.object({
  kind: catalogKindSchema,
  name: displayNameSchema,
  confirmSimilar: z.boolean().optional(),
});

const updateSchema = z.object({
  kind: catalogKindSchema,
  id: z.string().uuid(),
  name: displayNameSchema.optional(),
  isActive: z.boolean().optional(),
});

type CatalogRow = {
  id: string;
  name: string;
  deleted_at?: string | null;
  is_active?: boolean;
};

type DatabaseError = { message: string; code?: string };
type DatabaseResult = { data: unknown; error: DatabaseError | null };

type QueryBuilder = PromiseLike<DatabaseResult> & {
  select(columns: string): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
  is(column: string, value: null): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  ilike(column: string, value: string): QueryBuilder;
  insert(values: Record<string, unknown>): QueryBuilder;
  update(values: Record<string, unknown>): QueryBuilder;
  maybeSingle(): Promise<DatabaseResult>;
  single(): Promise<DatabaseResult>;
};

type PrivilegedDatabaseClient = {
  from(table: string): QueryBuilder;
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<DatabaseResult>;
};

function tableFor(kind: z.infer<typeof catalogKindSchema>): string {
  if (kind === "items") return "catalog_items";
  if (kind === "suppliers") return "suppliers";
  return "measurement_units";
}

function getDatabaseClient(): PrivilegedDatabaseClient {
  return createSupabaseAdminClient() as unknown as PrivilegedDatabaseClient;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const parsedKind = catalogKindSchema.safeParse(
    request.nextUrl.searchParams.get("kind"),
  );
  if (!parsedKind.success) {
    return NextResponse.json({ error: "نوع القائمة غير صحيح." }, { status: 400 });
  }

  const kind = parsedKind.data;
  const queryText = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const includeInactive =
    request.nextUrl.searchParams.get("includeInactive") === "true";
  const database = getDatabaseClient();

  let query = database
    .from(tableFor(kind))
    .select(kind === "units" ? "id, name, is_active" : "id, name")
    .order("name", { ascending: true })
    .limit(1000);

  if (kind !== "units") query = query.is("deleted_at", null);
  if (kind === "units" && !includeInactive) {
    query = query.eq("is_active", true);
  }
  if (queryText) {
    query = query.ilike("name", `%${escapeLike(queryText)}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "تعذر تحميل القائمة." }, { status: 500 });
  }

  const rows = (data ?? []) as CatalogRow[];
  return NextResponse.json({
    entries: rows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      isArchived: kind === "units" ? entry.is_active === false : false,
    })),
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "تحقق من اسم العنصر ونوع القائمة." },
      { status: 400 },
    );
  }

  const { kind, name, confirmSimilar } = parsed.data;
  const database = getDatabaseClient();
  const table = tableFor(kind);

  if (kind === "units") {
    const { data: existing, error: lookupError } = await database
      .from("measurement_units")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json(
        { error: "تعذر التحقق من الوحدة." },
        { status: 500 },
      );
    }
    if (existing) {
      return NextResponse.json(
        { error: "هذه الوحدة موجودة مسبقاً." },
        { status: 409 },
      );
    }
  }

  if (kind !== "units") {
    const { data: found, error: matchError } = await database
      .from(table)
      .select("id, name, deleted_at")
      .eq("normalized_name", normalizeNameForMatch(name))
      .limit(10);

    if (matchError) {
      return NextResponse.json(
        { error: "تعذر التحقق من الأسماء المتشابهة." },
        { status: 500 },
      );
    }

    const matches = (found ?? []) as CatalogRow[];
    const activeMatches = matches
      .filter((entry) => entry.deleted_at === null)
      .map(({ id, name: matchedName }) => ({ id, name: matchedName }));
    const deletedMatches = matches
      .filter((entry) => entry.deleted_at !== null)
      .map(({ id, name: matchedName }) => ({ id, name: matchedName }));

    if (activeMatches.length > 0) {
      return NextResponse.json(
        {
          code: "NAME_MATCHES",
          matches: activeMatches,
          deletedSimilar: deletedMatches,
        },
        { status: 409 },
      );
    }

    if (deletedMatches.length > 0 && !confirmSimilar) {
      return NextResponse.json(
        { code: "TRASH_SIMILAR", matches: deletedMatches },
        { status: 409 },
      );
    }
  }

  const { data: inserted, error } = await database
    .from(table)
    .insert({ name })
    .select("id, name")
    .single();

  const entry = inserted as CatalogRow | null;
  if (error || !entry) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "هذا الاسم موجود مسبقاً." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "تعذر إضافة العنصر." },
      { status: 500 },
    );
  }

  await publishInventoryChange();
  return NextResponse.json(
    {
      entry: { id: entry.id, name: entry.name, isArchived: false },
    },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (
    !parsed.success ||
    (!parsed.data.name && parsed.data.isActive === undefined)
  ) {
    return NextResponse.json(
      { error: "بيانات التعديل غير مكتملة." },
      { status: 400 },
    );
  }

  const { kind, id, name, isActive } = parsed.data;
  const database = getDatabaseClient();
  const values =
    kind === "units"
      ? {
          ...(name ? { name } : {}),
          ...(isActive !== undefined ? { is_active: isActive } : {}),
        }
      : name
        ? { name }
        : null;

  if (!values) {
    return NextResponse.json(
      { error: "لا يمكن تعديل هذا العنصر بهذه البيانات." },
      { status: 400 },
    );
  }

  let update = database.from(tableFor(kind)).update(values).eq("id", id);
  if (kind !== "units") update = update.is("deleted_at", null);

  const { data: updated, error } = await update
    .select("id, name")
    .maybeSingle();
  const entry = updated as CatalogRow | null;

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "هذا الاسم مستخدم بالفعل." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "تعذر حفظ التعديل." },
      { status: 500 },
    );
  }
  if (!entry) {
    return NextResponse.json(
      { error: "العنصر غير موجود." },
      { status: 404 },
    );
  }

  await publishInventoryChange();
  return NextResponse.json({
    entry: {
      id: entry.id,
      name: entry.name,
      isArchived: kind === "units" ? isActive === false : false,
    },
  });
}

export async function DELETE(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z
    .object({
      kind: z.enum(["items", "suppliers"]),
      id: z.string().uuid(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات الحذف غير صحيحة." },
      { status: 400 },
    );
  }

  const { kind, id } = parsed.data;
  const { data, error } = await getDatabaseClient().rpc(
    "soft_delete_trash_entry",
    {
      p_entry_type: kind === "items" ? "item" : "supplier",
      p_entry_id: id,
    },
  );

  if (error) {
    return NextResponse.json(
      { error: "تعذر نقل العنصر إلى سلة المحذوفات." },
      { status: 500 },
    );
  }
  if (data !== true) {
    return NextResponse.json(
      { error: "العنصر غير موجود أو محذوف مسبقاً." },
      { status: 404 },
    );
  }

  await publishInventoryChange();
  return NextResponse.json({ ok: true });
}
