import path from "path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static files only: every screen runs in the browser, which is the only place the Pi SDK works.
  output: "export",
  // The dev badge sits on top of the chat input on a phone-sized screen.
  devIndicators: false,
  // The monorepo root, so the shared package resolves from its yarn workspace link.
  turbopack: { root: path.join(__dirname, "..") },
};

export default nextConfig;
