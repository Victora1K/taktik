import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Yjs must be a single module instance; bundling it alongside y-protocols' CJS require duplicates it.
  serverExternalPackages: ["yjs", "y-protocols", "lib0"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/((?!t/).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Konva's Node entry requires the optional native `canvas` package, which is never installed.
    if (isServer) config.externals = [...(config.externals ?? []), { canvas: "commonjs canvas" }];
    return config;
  },
};

export default nextConfig;
