import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CatalogProvider } from "@/features/catalog/catalog-provider";
import { AuthGate } from "@/features/auth/auth-gate";
import { MobileAppShell } from "@/components/mobile-app-shell";

export const metadata: Metadata = {
  title: "نظام الجرد والاستلام",
  description: "نظام إلكتروني لتسجيل عمليات الجرد واستلام البضائع ومتابعتها.",
  applicationName: "نظام الجرد والاستلام",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "الجرد والاستلام",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c5b39",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <AuthGate>
          <CatalogProvider><MobileAppShell>{children}</MobileAppShell></CatalogProvider>
        </AuthGate>
      </body>
    </html>
  );
}
