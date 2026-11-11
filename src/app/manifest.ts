import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "نظام الجرد والاستلام",
    short_name: "الجرد والاستلام",
    description: "تسجيل عمليات الجرد واستلام البضائع.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f8fafc",
  };
}
