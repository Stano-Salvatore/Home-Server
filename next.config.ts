import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["epub2", "pdf-parse", "systeminformation"],
  // Pin the workspace root to this app. On Termux a stray ~/package-lock.json
  // makes Next.js infer the wrong root and warn on every boot; this silences it.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
