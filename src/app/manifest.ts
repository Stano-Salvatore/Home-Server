import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Server",
    short_name: "Nedory",
    description: "Self-hosted local AI agent dashboard",
    start_url: "/",
    display: "standalone",
    // Matches globals.css's --bg (Odysseus theme pass) — was #0b0c0e, the
    // stale pre-theme value, mismatched against every screen the PWA
    // splash/status-bar would actually show.
    background_color: "#0a0d11",
    theme_color: "#0a0d11",
    icons: [
      { src: "/icon-192-v3.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512-v3.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512-v3.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // GET (not POST) so this needs no service worker involvement — Android
    // just navigates the installed PWA to /share?title=...&text=...&url=...
    // with whatever the OS share sheet handed it.
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
