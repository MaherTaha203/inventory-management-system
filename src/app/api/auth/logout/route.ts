import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  hasSameOrigin,
  readSessionToken,
} from "@/lib/auth/http";
import { logoutSession } from "@/lib/auth/service";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  const sessionToken = readSessionToken(request);

  try {
    if (sessionToken) await logoutSession(sessionToken);
  } catch {
    return NextResponse.json(
      { error: "تعذر إنهاء الجلسة على الخادم." },
      { status: 500 },
    );
  }

  clearSessionCookie(response);
  return response;
}
