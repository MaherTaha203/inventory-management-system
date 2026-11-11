import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePin } from "@/lib/auth/service";
import { hasSameOrigin, setSessionCookie } from "@/lib/auth/http";

const loginSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات الدخول غير مكتملة." }, { status: 400 });
  }

  try {
    const result = await authenticatePin(
      parsed.data.pin,
      parsed.data.deviceToken,
    );

    if (!result.ok) {
      if (result.reason === "locked") {
        return NextResponse.json(
          {
            error: "تم إيقاف محاولات الدخول مؤقتاً.",
            blockedUntil: result.blockedUntil,
          },
          { status: 429 },
        );
      }

      if (result.reason === "device_limit") {
        return NextResponse.json(
          { error: "تم الوصول إلى الحد الأقصى للأجهزة النشطة." },
          { status: 409 },
        );
      }

      if (result.reason === "setup_required") {
        return NextResponse.json(
          { error: "يجب إعداد رمز الدخول أولاً." },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error: "رمز الدخول غير صحيح.",
          remainingAttempts: result.remainingAttempts,
        },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, result.sessionToken);
    return response;
  } catch {
    return NextResponse.json(
      { error: "تعذر إتمام تسجيل الدخول حالياً." },
      { status: 500 },
    );
  }
}
