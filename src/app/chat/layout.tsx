import { ConversationList } from "@/components/chat/conversation-list";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <ConversationList />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
