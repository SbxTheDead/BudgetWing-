import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the user's home
  // directory otherwise makes Turbopack infer C:\Users\asus as the root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // `agent/` and `shared/` live at the project root and are resolved through the
  // tsconfig path aliases (@agent/*, @shared/*), so no webpack alias is needed.
  // Keep the OpenAI SDK external so the Node runtime requires it at runtime
  // instead of bundling it into server chunks.
  serverExternalPackages: ["openai"],
};

export default nextConfig;
