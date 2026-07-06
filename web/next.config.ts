import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  // 讓手機用區域 IP 連 dev server 時，HMR / 前端資源不會被擋
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.122",
    "172.20.10.5",
  ],
};

export default nextConfig;
