import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar/sidebar";

export const metadata: Metadata = {
  title: "Home Server",
  description: "Self-hosted local AI agent dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nedory", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/favicon-32-v3.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16-v3.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-v3.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon-v3.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full h-full flex text-ink" style={{ background: "var(--bg)" }}>
        <Sidebar />
        <main className="flex-1 min-w-0 h-screen overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
