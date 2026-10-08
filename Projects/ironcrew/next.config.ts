import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: true, // true returns a 308 code, false returns a 307 temporary redirect
      },
    ];
  },
};

export default nextConfig;
