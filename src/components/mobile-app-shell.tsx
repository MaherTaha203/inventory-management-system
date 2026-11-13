"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function MobileAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-app-shell">
      <header className="mobile-app-header">
        <Link href="/" aria-label="الرئيسية">
          <span className="mobile-app-header-mark" aria-hidden="true">▦</span>
          <span>نظام إدارة المخزون</span>
        </Link>
        <div className="mobile-app-header-actions">
          <Link href="/archive" aria-label="الأرشيف" title="الأرشيف">▤</Link>
          <Link href="/settings" aria-label="الإعدادات" title="الإعدادات">⚙</Link>
        </div>
      </header>
      <div className="mobile-app-content">{children}</div>
    </div>
  );
}
