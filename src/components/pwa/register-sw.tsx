"use client";

import { useEffect } from "react";

// Registers the no-op passthrough service worker (see public/sw.js). Only
// meaningfully succeeds in a secure context — the browser's loopback
// exception makes http://localhost / http://127.0.0.1 count as one, which
// covers this app's primary use case (the phone browsing its own on-device
// server); a Tailscale IP from another device is plain HTTP and the
// registration will just silently reject there, which is fine — nothing
// depends on it succeeding.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-secure context, unsupported browser, etc. — installability via
      // "Add to Home Screen" just won't get the full PWA treatment there.
    });
  }, []);
  return null;
}
