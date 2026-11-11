import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { initializePin } from "@/lib/auth/service";
import {
  hasSameOrigin,
  setSessionCookie,
  verifyInitialSetupSecret,
} from "@/lib/auth/http";

const setupSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  confirmation: z.string().regex(/^\d{6}$/),
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  setupSecret: z.string().min(32).max(512),
});

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات التهيئة غير مكتملة." }, { status: 400 });
  }

  if (!verifyInitialSetupSecret(parsed.data.setupSecret)) {
    return NextResponse.json({ error: "مفتاح التهيئة غير صحيح." }, { status: 403 });
  }

  try {
    const result = await initializePin(
      parsed.data.pin,
      parsed.data.confirmation,
      parsed.data.deviceToken,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: "تعذر إعداد رمز الدخول. قد يكون قد تم إعداده مسبقاً." },
        { status: 409 },
      );
    }

    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, result.sessionToken);
    return response;
  } catch {
    return NextResponse.json(
      { error: "تعذر إعداد رمز الدخول حالياً." },
      { status: 500 },
    );
  }
}
