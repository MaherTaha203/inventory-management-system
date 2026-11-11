import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getPrivilegedDatabaseClient } from "@/lib/supabase/query-client";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!secret || secret.length < 32 || authorization.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
  }

  const { data, error } = await getPrivilegedDatabaseClient().rpc(
    "purge_expired_trash",
    {},
  );
  if (error) {
    return NextResponse.json({ error: "تعذر حذف السجلات المنتهية." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged: data });
}
