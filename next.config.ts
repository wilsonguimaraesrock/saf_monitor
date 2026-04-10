import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  serverExternalPackages: ["playwright", "winston", "node-cron", "pg", "xlsx"],
};

export default nextConfig;
