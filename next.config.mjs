// Next.js config. Owner: Lead.
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // HiGHS ships a WebAssembly binary; keep it out of the server bundle so it loads from node_modules.
  serverExternalPackages: ["highs", "javascript-lp-solver"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "l333dcsr-3000.usw3.devtunnels.ms",
        "l333dcsr-3001.usw3.devtunnels.ms",
      ],
    },
  },
  // Docker builds set NEXT_OUTPUT=standalone for a small production image.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
