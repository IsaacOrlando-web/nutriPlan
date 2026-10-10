import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NutriPlan AI",
    short_name: "NutriPlan",
    description: "A team of AI helpers that builds a healthy, affordable meal plan and keeps fixing it.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#16A34A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
