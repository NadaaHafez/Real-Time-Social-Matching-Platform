import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/SessionProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Roll — meet someone new",
  description: "Random 1-on-1 chats inside the Pi Browser.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#09090b" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Loaded before the app starts, so window.Pi exists when sign-in runs. */}
        <Script src="https://sdk.minepi.com/pi-sdk.js" strategy="beforeInteractive" />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
