"use client";

import { useEffect, useState } from "react";

// Transient (not persisted) shared "is the mobile drawer open" flag. The nav
// rail (Sidebar) and the chat conversation list are separate components in
// different layout subtrees, but on mobile the hamburger needs to open/close
// both together as one drawer — the same "clears the whole left side" intent
// the desktop collapse (useSidebarCollapsed) already has, just without
// localStorage persistence: unlike the desktop preference, this always
// starts closed on a fresh page load.
const EVT = "nedory-mobile-nav-open-change";
let current = false;

export function useMobileNavOpen(): [boolean, (next: boolean) => void] {
  const [open, setOpenState] = useState(false);

  useEffect(() => {
    const sync = () => setOpenState(current);
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);

  function set(next: boolean) {
    current = next;
    window.dispatchEvent(new Event(EVT));
  }

  return [open, set];
}
