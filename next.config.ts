import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "sharp",
    "epub2",
    "pdf-parse",
    "systeminformation",
  ],
};

export default nextConfig;
