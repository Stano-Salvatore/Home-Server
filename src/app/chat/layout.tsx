import { ConversationList } from "@/components/chat/conversation-list";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <ConversationList />
      {/* Viewport-fixed with a *constant* left inset — 16rem (this list's own
          width) on mobile, 30rem (sidebar's 14rem + this list's 16rem) on
          desktop — rather than a flex remainder. The inset never changes
          with the sidebar's or this list's live collapsed state, so toggling
          either never shifts the column; it just leaves the gutter empty
          when they're collapsed instead of reflowing into it. A live
          (100vw, ignoring both panels entirely) centering was tried first
          and rejected: at common desktop widths sidebar+list together (30rem)
          are wider than half the viewport minus half the column's max-width,
          so a true-viewport-centered column visibly clipped behind the
          conversation list. ConversationList's `relative z-20` (vs. this
          pane's z-10) is kept as a safety net for any width where the
          constant gutter still isn't enough. */}
      <div className="fixed left-64 md:left-[30rem] right-0 top-12 md:top-0 bottom-0 z-10">
        <div className="mx-auto h-full w-full max-w-3xl flex flex-col">{children}</div>
      </div>
    </div>
  );
}
