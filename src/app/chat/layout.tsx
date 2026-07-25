import { ConversationList } from "@/components/chat/conversation-list";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <ConversationList />
      {/* Viewport-fixed with a *constant* left inset on desktop — 30rem
          (sidebar's 14rem + this list's 16rem) — rather than a flex
          remainder. The inset never changes with the sidebar's or list's
          live collapsed state, so toggling either never shifts the column;
          it just leaves the gutter empty when they're collapsed instead of
          reflowing into it. A live (100vw, ignoring both panels entirely)
          centering was tried first and rejected: at common desktop widths
          sidebar+list together (30rem) are wider than half the viewport
          minus half the column's max-width, so a true-viewport-centered
          column visibly clipped behind the conversation list.
          On mobile there's no gutter at all (left-0): both the nav rail and
          this list are off-canvas drawers there (see useMobileNavOpen), not
          flex siblings reserving space, so the column gets the full width —
          reserving a constant mobile gutter here for a list that isn't
          actually occupying that space was the earlier (wrong) approach and
          is exactly what left a dead strip beside the chat column on a real
          phone. ConversationList's z-[45] (vs. this pane's z-10) still means
          it overlays correctly on top when opened. */}
      <div className="fixed left-0 md:left-[30rem] right-0 top-12 md:top-0 bottom-0 z-10">
        <div className="mx-auto h-full w-full max-w-3xl flex flex-col">{children}</div>
      </div>
    </div>
  );
}
