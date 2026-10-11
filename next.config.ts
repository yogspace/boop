import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image runs the standalone server (see Dockerfile).
  output: "standalone",
  reactStrictMode: true,
  // No AGENTS.md/CLAUDE.md written into the repo by `next dev`.
  agentRules: false,
  // Dev only: the dev server may be opened from a phone in the LAN.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // No "X-Powered-By" – it only tells others what to probe for.
  poweredByHeader: false,
  async headers() {
    return [
      // Everywhere the usual protection; framed by no other page
      // (clickjacking).
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      // Internal routes (statistics beacons, cron) belong in no index.
      {
        source: "/next/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
