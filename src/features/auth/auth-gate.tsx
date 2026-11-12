"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type AuthPhase = "checking" | "login" | "setup" | "authenticated" | "tab-blocked" | "error";

function createDeviceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getOrCreateDeviceToken(): string {
  const key = "inventory-device-token";
  const existing = localStorage.getItem(key);
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;

  const token = createDeviceToken();
  localStorage.setItem(key, token);
  return token;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>("checking");
  const [deviceToken, setDeviceToken] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const tabBlocked = useRef(false);
  const lastPingAt = useRef(0);

  useEffect(() => {
    let active = true;
    const tabId = crypto.randomUUID();
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("inventory-management-single-tab");

    function blockThisTab() {
      if (!active || tabBlocked.current) return;
      tabBlocked.current = true;
      setPhase("tab-blocked");
    }

    if (channel) {
      channel.onmessage = (event: MessageEvent<{ type?: string; tabId?: string; target?: string }>) => {
        const data = event.data;
        if (data.type === "claim" && data.tabId && data.tabId !== tabId) {
          if (tabId < data.tabId) {
            channel.postMessage({ type: "block", target: data.tabId });
          } else {
            blockThisTab();
          }
        }

        if (data.type === "block" && data.target === tabId) {
          blockThisTab();
        }
      };
      channel.postMessage({ type: "claim", tabId });
    }

    async function checkSession() {
      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!active || tabBlocked.current) return;

        if (sessionResponse.ok) {
          lastPingAt.current = Date.now();
          setPhase("authenticated");
          return;
        }

        const statusResponse = await fetch("/api/auth/status", {
          cache: "no-store",
        });
        if (!active || tabBlocked.current) return;
        if (!statusResponse.ok) throw new Error("تعذر التحقق من إعدادات الدخول.");

        const status = (await statusResponse.json()) as { setupRequired: boolean };
        setPhase(status.setupRequired ? "setup" : "login");
      } catch {
        if (active) {
          setMessage("تعذر الاتصال بالخادم. تحقق من الاتصال ثم أعد المحاولة.");
          setPhase("error");
        }
      }
    }

    const start = window.setTimeout(() => {
      if (!tabBlocked.current) {
        setDeviceToken(getOrCreateDeviceToken());
        void checkSession();
      }
    }, channel ? 150 : 0);

    return () => {
      active = false;
      window.clearTimeout(start);
      channel?.close();
    };
  }, []);

  useEffect(() => {
    if (phase !== "authenticated") return;

    let idleTimer: ReturnType<typeof setTimeout>;
    let pingInProgress = false;

    const lockForInactivity = () => {
      // Revoke the server-side session and clear its cookie when inactivity locks the app.
      void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
        setMessage("تم قفل النظام بسبب عدم النشاط. أدخل رمز الدخول للمتابعة.");
        setPhase("login");
      });
    };

    const scheduleIdleLock = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(lockForInactivity, 10 * 60 * 1000);
    };

    const recordActivity = () => {
      scheduleIdleLock();

      if (Date.now() - lastPingAt.current < 60_000 || pingInProgress) return;
      pingInProgress = true;

      void fetch("/api/auth/session", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            setMessage("انتهت الجلسة. أدخل رمز الدخول للمتابعة.");
            setPhase("login");
          } else {
            lastPingAt.current = Date.now();
          }
        })
        .catch(() => {
          setMessage("تعذر تجديد الجلسة. تحقق من الاتصال.");
        })
        .finally(() => {
          pingInProgress = false;
        });
    };

    scheduleIdleLock();
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((eventName) =>
      window.addEventListener(eventName, recordActivity, { passive: true }),
    );

    return () => {
      clearTimeout(idleTimer);
      events.forEach((eventName) =>
        window.removeEventListener(eventName, recordActivity),
      );
    };
  }, [phase]);

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deviceToken || submitting) return;

    setSubmitting(true);
    setMessage("");

    const endpoint = phase === "setup" ? "/api/auth/setup" : "/api/auth/login";
    const body =
      phase === "setup"
        ? { pin, confirmation, setupSecret, deviceToken }
        : { pin, deviceToken };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(result.error ?? "تعذر تسجيل الدخول.");
        return;
      }

      setPin("");
      setConfirmation("");
      setSetupSecret("");
      lastPingAt.current = Date.now();
      setPhase("authenticated");
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setSubmitting(false);
    }
  }, [confirmation, deviceToken, phase, pin, setupSecret, submitting]);

  const lockNow = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setPin("");
    setMessage("");
    setPhase("login");
  }, []);

  if (phase === "authenticated") {
    return (
      <>
        <div className="mobile-app-lock fixed left-4 top-4 z-50">
          <button
            type="button"
            onClick={() => void lockNow()}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--muted)] shadow-sm"
          >
            قفل النظام
          </button>
        </div>
        {children}
      </>
    );
  }

  if (phase === "checking") {
    return (
      <main className="grid min-h-screen place-items-center p-4" aria-live="polite">
        <p className="text-sm text-[var(--muted)]">جارٍ التحقق من جلسة الدخول…</p>
      </main>
    );
  }

  if (phase === "tab-blocked") {
    return (
      <main className="grid min-h-screen place-items-center p-4">
        <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-7 text-center shadow-sm">
          <h1 className="text-xl font-bold">النظام مفتوح في تبويب آخر</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            أغلق التبويب الآخر ثم حدّث هذه الصفحة للمتابعة. يسمح النظام بتبويب واحد لكل جهاز.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
          >
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold text-[var(--accent)]">نظام الجرد والاستلام</p>
        <h1 className="mt-3 text-2xl font-bold">
          {phase === "setup" ? "إعداد رمز الدخول" : "تسجيل الدخول"}
        </h1>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
          {phase === "setup"
            ? "أدخل رمزاً مشتركاً من ستة أرقام، ثم أدخل مفتاح التهيئة الذي تم ضبطه على الخادم."
            : "أدخل رمز الدخول المكوّن من ستة أرقام."}
        </p>

        {phase === "error" ? (
          <div className="mt-6">
            <p role="alert" className="text-sm text-red-700">{message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium">
              رمز الدخول
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-center text-2xl tracking-[0.5em]"
                required
              />
            </label>

            {phase === "setup" && (
              <>
                <label className="block text-sm font-medium">
                  تأكيد رمز الدخول
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-2xl tracking-[0.5em]"
                    required
                  />
                </label>
                <label className="block text-sm font-medium">
                  مفتاح التهيئة
                  <input
                    autoComplete="off"
                    type="password"
                    value={setupSecret}
                    onChange={(event) => setSetupSecret(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3"
                    required
                  />
                </label>
              </>
            )}

            {message && (
              <p role="alert" className="text-sm leading-6 text-red-700">{message}</p>
            )}

            <button
              type="submit"
              disabled={submitting || pin.length !== 6 || (phase === "setup" && (confirmation.length !== 6 || setupSecret.length < 32))}
              className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "جارٍ التحقق…" : phase === "setup" ? "إعداد النظام" : "دخول"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
