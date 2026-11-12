"use client";

import Link from "next/link";
import { useState } from "react";

export default function SettingsPage() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (newPin !== confirmation) {
      setMessage("رمز الدخول الجديد وتأكيده غير متطابقين.");
      return;
    }
    if (currentPin === newPin) {
      setMessage("اختر رمزاً جديداً مختلفاً عن الرمز الحالي.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin, confirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "تعذر تغيير الرمز.");
      setCurrentPin("");
      setNewPin("");
      setConfirmation("");
      setMessage("تم تغيير رمز الدخول. انتهت صلاحية الجلسات على الأجهزة الأخرى.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "تعذر تغيير رمز الدخول.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8">
        <Link href="/" className="text-sm font-semibold text-[var(--accent)]">← الرئيسية</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">إعدادات النظام</h1>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">تغيير رمز الدخول المشترك للنظام.</p>
      </header>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
        <label className="block text-sm font-medium">
          الرمز الحالي
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="current-password"
            value={currentPin}
            onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-xl tracking-[0.5em]"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          الرمز الجديد
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="new-password"
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-xl tracking-[0.5em]"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          تأكيد الرمز الجديد
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-xl tracking-[0.5em]"
            required
          />
        </label>

        {message && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm leading-6">{message}</p>}
        <button
          type="submit"
          disabled={busy || currentPin.length !== 6 || newPin.length !== 6 || confirmation.length !== 6}
          className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "جارٍ تغيير الرمز…" : "تغيير رمز الدخول"}
        </button>
      </form>
    </main>
  );
}
