import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF rendering reads the bundled Inter fonts from disk at runtime.
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**"],
  },
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  experimental: {
    serverActions: {
      // Logo / signature uploads go through server actions.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
