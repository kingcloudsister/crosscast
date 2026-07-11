import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: must be required at runtime, not bundled by webpack.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Prompt and font files are read from disk at runtime; make sure Vercel bundles them with the routes.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**", "./assets/fonts/**"],
  },
};

export default nextConfig;
