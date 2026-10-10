// Next.js config. Owner: Lead.
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // HiGHS ships a WebAssembly binary; keep it out of the server bundle so it loads from node_modules.
  serverExternalPackages: ["highs", "javascript-lp-solver"],
  // Docker builds set NEXT_OUTPUT=standalone for a small production image.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default withNextIntl(nextConfig);
