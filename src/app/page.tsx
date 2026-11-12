const modules = [
  { title: "القوائم", href: "/catalog", icon: "list", tone: "mint" },
  { title: "الأرشيف", href: "/archive", icon: "archive", tone: "blue" },
  { title: "التقارير", href: "/reports", icon: "chart", tone: "blue" },
  { title: "سلة المحذوفات", href: "/trash", icon: "trash", tone: "rose" },
  { title: "الإعدادات", href: "/settings", icon: "settings", tone: "slate" },
];

function ModuleIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true as const };
  switch (name) {
    case "clipboard": return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 4.5Z" /><path d="m8.5 11 1.5 1.5 2.5-2.5M14.5 12h2M8.5 16l1.5 1.5 2.5-2.5M14.5 17h2" /></svg>;
    case "package": return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.3 7.6 7.7 4.5 7.7-4.5M12 21v-8.9M8 5.3l8 4.6" /><path d="m9.5 14.5 1.6 1.6 3.5-3.5" /></svg>;
    case "list": return <svg {...common}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>;
    case "archive": return <svg {...common}><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></svg>;
    case "chart": return <svg {...common}><path d="M4 20V11h4v9M10 20V5h4v15M16 20v-8h4v8" /></svg>;
    case "trash": return <svg {...common}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 1.5 1.2-1.5 2.6-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.9h-3l-.3-1.9a8 8 0 0 1-1.7-1l-1.7.7-1.5-2.6 1.5-1.2a7 7 0 0 1 0-2l-1.5-1.2 1.5-2.6 1.7.7a8 8 0 0 1 1.7-1l.3-1.9h3l.3 1.9a8 8 0 0 1 1.7 1l1.7-.7 1.5 2.6-1.5 1.2a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)" /></svg>;
  }
}

export default function HomePage() {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-intro"><h1>لوحة التحكم</h1></section>
      <section className="primary-actions" aria-label="العمليات الرئيسية">
        <a className="primary-card primary-stocktake" href="/stocktakes">
          <span className="primary-card-icon"><ModuleIcon name="clipboard" /></span>
          <span className="primary-card-title">الجرد</span>
        </a>
        <a className="primary-card primary-receipt" href="/receipts">
          <span className="primary-card-icon"><ModuleIcon name="package" /></span>
          <span className="primary-card-title">الاستلام</span>
        </a>
      </section>
      <section className="secondary-section" aria-label="وحدات النظام">
        <h2 className="section-title">الوحدات</h2>
        <div className="secondary-grid">
          {modules.map((module) => (
            <a className="module-card" href={module.href} key={module.href}>
              <span className={`module-icon tone-${module.tone}`}><ModuleIcon name={module.icon} /></span>
              <strong>{module.title}</strong>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
