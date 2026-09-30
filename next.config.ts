import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra packages must not be bundled by Next.js (per Mastra's Next.js deployment guide).
  serverExternalPackages: ["@mastra/*"],
};

export default nextConfig;
