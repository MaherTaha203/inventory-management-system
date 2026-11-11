import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CatalogProvider } from "@/features/catalog/catalog-provider";

export const metadata: Metadata = {
  title: "نظام الجرد والاستلام",
  description: "نظام إلكتروني لتسجيل عمليات الجرد واستلام البضائع ومتابعتها.",
  applicationName: "نظام الجرد والاستلام",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body><CatalogProvider>{children}</CatalogProvider></body>
    </html>
  );
}
