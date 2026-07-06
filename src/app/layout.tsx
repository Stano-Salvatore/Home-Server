import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar/sidebar";

export const metadata: Metadata = {
  title: "Home Server",
  description: "Self-hosted local AI agent dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full h-full flex bg-neutral-950 text-neutral-100">
        <Sidebar />
        <main className="flex-1 min-w-0 h-screen overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
