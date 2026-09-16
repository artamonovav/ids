import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Доступ к dev-серверу по IP/LAN (Next 16 блокирует cross-origin HMR).
  // Добавьте свой IP/хост при доступе из сети.
  allowedDevOrigins: ["192.168.4.2", "localhost"],
};

export default nextConfig;
