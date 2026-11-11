import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { hasSameOrigin } from "@/lib/auth/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeNameForMatch, displayNameSchema } from "@/lib/validation/name";

const catalogKindSchema = z.enum(["items", "suppliers", "units"]);
const createSchema = z.object({
  kind: catalogKindSchema,
  name: displayNameSchema,
});
const updateSchema = z.object({
  kind: catalogKindSchema,
  id: z.string().uuid(),
  name: displayNameSchema.optional(),
  isActive: z.boolean().optional(),
});

function tableFor(kind: z.infer<typeof catalogKindSchema>) {
  if (kind === "items") return "catalog_items";
  if (kind === "suppliers") return "suppliers";
  return "measurement_units";
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
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from(tableFor(kind))
    .select(kind === "units" ? "id, name, is_active" : "id, name")
    .order("name", { ascending: true })
    .limit(1000);

  if (kind !== "units") query = query.is("deleted_at", null);
  if (kind === "units" && !includeInactive) query = query.eq("is_active", true);
  if (queryText) query = query.ilike("name", `%${escapeLike(queryText)}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "تعذر تحميل القائمة." }, { status: 500 });
  }

  return NextResponse.json({
    entries: (data ?? []).map((entry) => ({
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
    return NextResponse.json({ error: "تحقق من اسم العنصر ونوع القائمة." }, { status: 400 });
  }

  const { kind, name } = parsed.data;
  const supabase = createSupabaseAdminClient();
  const table = tableFor(kind);

  if (kind === "units") {
    const { data: existing, error: lookupError } = await supabase
      .from("measurement_units")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: "تعذر التحقق من الوحدة." }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: "هذه الوحدة موجودة مسبقاً." }, { status: 409 });
    }
  }

  let matches: Array<{ id: string; name: string }> = [];
  if (kind !== "units") {
    const { data: found, error: matchError } = await supabase
      .from(table)
      .select("id, name")
      .eq("normalized_name", normalizeNameForMatch(name))
      .is("deleted_at", null)
      .limit(10);

    if (matchError) {
      return NextResponse.json({ error: "تعذر التحقق من الأسماء المتشابهة." }, { status: 500 });
    }
    matches = found ?? [];
  }

  const { data, error } = await supabase
    .from(table)
    .insert({ name })
    .select("id, name")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "تعذر إضافة العنصر." }, { status: 500 });
  }

  return NextResponse.json(
    {
      entry: { id: data.id, name: data.name, isArchived: false },
      similarMatches: matches,
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
  if (!parsed.success || (!parsed.data.name && parsed.data.isActive === undefined)) {
    return NextResponse.json({ error: "بيانات التعديل غير مكتملة." }, { status: 400 });
  }

  const { kind, id, name, isActive } = parsed.data;
  const supabase = createSupabaseAdminClient();
  const table = tableFor(kind);
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
    return NextResponse.json({ error: "لا يمكن تعديل هذا العنصر بهذه البيانات." }, { status: 400 });
  }

  let update = supabase.from(table).update(values).eq("id", id);
  if (kind !== "units") update = update.is("deleted_at", null);

  const { data, error } = await update.select("id, name").maybeSingle();
  if (error) {
    return NextResponse.json({ error: "تعذر حفظ التعديل." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "العنصر غير موجود." }, { status: 404 });
  }

  return NextResponse.json({
    entry: {
      id: data.id,
      name: data.name,
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
  const parsed = z.object({
    kind: z.enum(["items", "suppliers"]),
    id: z.string().uuid(),
  }).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات الحذف غير صحيحة." }, { status: 400 });
  }

  const { kind, id } = parsed.data;
  const supabase = createSupabaseAdminClient();
  const rpcClient = supabase as unknown as {
    rpc: (
      functionName: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("soft_delete_trash_entry", {
    p_entry_type: kind === "items" ? "item" : "supplier",
    p_entry_id: id,
  });

  if (error) {
    return NextResponse.json({ error: "تعذر نقل العنصر إلى سلة المحذوفات." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "العنصر غير موجود أو محذوف مسبقاً." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
