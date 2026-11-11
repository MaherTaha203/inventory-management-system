import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { getPrivilegedDatabaseClient } from "@/lib/supabase/query-client";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const params = await context.params;
  const parsedId = z.string().uuid().safeParse(params.id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "معرّف الصنف غير صحيح." }, { status: 400 });
  }

  const database = getPrivilegedDatabaseClient();
  const { data: item, error: itemError } = await database
    .from("catalog_items")
    .select("id, name")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json({ error: "تعذر تحميل الصنف." }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "الصنف غير موجود." }, { status: 404 });
  }

  const { data: history, error } = await database.rpc("get_item_history", {
    p_item_id: parsedId.data,
  });
  if (error) {
    return NextResponse.json({ error: "تعذر تحميل سجل الصنف." }, { status: 500 });
  }

  return NextResponse.json({ item, history });
}
