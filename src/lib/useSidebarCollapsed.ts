"use client";

import { useEffect, useState } from "react";

// One collapsed flag shared by every piece of left-side chrome (the nav rail
// AND the chat conversation list) so the hamburger clears all of it at once.
// The components live in different layout subtrees, so the state is shared
// through a module-level value + window event (localStorage only persists it).
const KEY = "nedory-sidebar-collapsed";
const EVT = "nedory-sidebar-collapsed-change";

let current: boolean | null = null; // null = not yet read from storage

function readCollapsed(): boolean {
  if (current === null) {
    try {
      current = localStorage.getItem(KEY) === "1";
    } catch {
      current = false;
    }
  }
  return current;
}

export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => setCollapsed(readCollapsed());
    // Initial read is deferred a tick: the server-rendered HTML can't know
    // the stored value, so it must hydrate as expanded first.
    const t = setTimeout(sync, 0);
    window.addEventListener(EVT, sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener(EVT, sync);
    };
  }, []);

  function set(next: boolean) {
    current = next;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // private mode etc. — the in-memory value still drives this visit
    }
    window.dispatchEvent(new Event(EVT));
  }

  return [collapsed, set];
}
