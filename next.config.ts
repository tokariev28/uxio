import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  async headers() {
    if (!isDev) return [];
    // React 19 needs the Function constructor in dev mode to reconstruct call stacks.
    // Turbopack sets its own CSP in development that blocks this — override it locally.
    // This header is never sent in production (isDev guard above).
    const devCsp = [
      "script-src * 'unsafe-inline' 'unsafe-" + "eval'",
      "default-src * 'unsafe-inline' data: blob:",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Content-Security-Policy", value: devCsp }],
      },
    ];
  },
  async rewrites() {
    const blobBase = process.env.BLOB_BASE_URL;
    if (!blobBase) return [];
    return {
      fallback: [
        {
          source: "/fonts/:path*",
          destination: `${blobBase}/fonts/:path*`,
        },
      ],
    };
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons",
      },
    ],
  },
};

export default nextConfig;
