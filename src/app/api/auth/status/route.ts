import { NextResponse } from "next/server";
import { isPinInitialized } from "@/lib/auth/service";

export async function GET() {
  try {
    return NextResponse.json({ setupRequired: !(await isPinInitialized()) });
  } catch {
    return NextResponse.json(
      { error: "تعذر التحقق من إعدادات النظام." },
      { status: 500 },
    );
  }
}
