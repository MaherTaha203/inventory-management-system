"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const tabs = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/stocktakes", label: "الجرد", icon: "clipboard" },
  { href: "/receipts", label: "الاستلام", icon: "download" },
  { href: "/catalog", label: "القوائم", icon: "layers" },
  { href: "/reports", label: "التقارير", icon: "chart" },
];

function TabIcon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };
  switch (name) {
    case "home":
      return <svg {...common}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></svg>;
    case "clipboard":
      return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 4.5ZM8.5 11l1.5 1.5 2.5-2.5M14.5 12h2M8.5 16l1.5 1.5 2.5-2.5M14.5 17h2" /></svg>;
    case "download":
      return <svg {...common}><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" /></svg>;
    case "layers":
      return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg>;
    default:
      return <svg {...common}><path d="M4 19V5m0 14h16M8 15v-4m4 4V7m4 8V9m4 6V4" /></svg>;
  }
}

export function MobileAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mobile-app-shell">
      <div className="mobile-app-content">{children}</div>
      <nav className="mobile-app-nav" aria-label="التنقل الرئيسي">
        {tabs.map((tab) => {
          const active = tab.href === "/"
            ? pathname === "/"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              href={tab.href}
              key={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
            >
              <TabIcon name={tab.icon} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
