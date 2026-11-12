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
    background_color: "#f1f7f2",
    theme_color: "#0c5b39",
  };
}
