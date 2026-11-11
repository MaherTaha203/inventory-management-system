const modules = [
  {
    title: "الجرد",
    description: "تسجيل عمليات الجرد ومراجعة سجلاتها.",
    href: "/stocktakes",
  },
  {
    title: "الاستلام",
    description: "تسجيل سندات استلام البضائع ومتابعتها.",
    href: "/receipts",
  },
  {
    title: "القوائم",
    description: "إدارة قوائم الأصناف والموردين والوحدات.",
    href: "/catalog",
  },
  {
    title: "الأرشيف",
    description: "مراجعة عمليات الجرد وسندات الاستلام المحفوظة.",
    href: "/archive",
  },
  {
    title: "التقارير",
    description: "عرض السجلات والبحث والتصفية والتصدير.",
    href: "/reports",
  },
  {
    title: "سلة المحذوفات",
    description: "استعادة السجلات أو حذفها نهائياً.",
    href: "/trash",
  },
  {
    title: "الإعدادات",
    description: "تغيير رمز الدخول المشترك.",
    href: "/settings",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10">
        <p className="mb-2 text-sm font-medium text-[var(--accent)]">لوحة النظام</p>
        <h1 className="text-3xl font-bold tracking-tight">نظام الجرد والاستلام</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)]">
          مساحة موحدة لتسجيل عمليات الجرد والاستلام ومراجعتها.
        </p>
      </header>

      <section aria-label="وحدات النظام" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <a
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
          >
            <h2 className="text-xl font-semibold">{module.title}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{module.description}</p>
            <span className="mt-6 inline-block text-sm font-semibold text-[var(--accent)]">
              فتح الوحدة ←
            </span>
          </a>
        ))}
      </section>

      <footer className="mt-auto pt-12 text-xs text-[var(--muted)]">
        إصدار تأسيسي — واجهة أولية قيد التطوير
      </footer>
    </main>
  );
}
