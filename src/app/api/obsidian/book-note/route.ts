import { NextRequest, NextResponse } from "next/server";
import { getConversation, listMessages } from "@/server/chat/service";
import { backendFor } from "@/server/backends/registry";
import { BOOK_NOTE_PROMPT, parseBookNoteDraft, saveBookNote, type BookNoteDraft } from "@/server/obsidian/bookNotes";
import type { BackendKind } from "@/server/backends/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Turn a conversation about a book into a note in the vault, in two steps.
//
// POST { conversationId }                  -> reads the conversation, returns a
//                                             draft { title, author, year, notes }
// POST { conversationId, draft }           -> writes that draft to the vault
//
// The draft comes back for confirmation rather than being written straight
// away, because the model is guessing which book was meant and where to file
// it, and a wrong guess would leave a stray note in someone's reading vault.

const MAX_TURNS = 40;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    draft?: BookNoteDraft;
  };

  // Second call: the user confirmed a draft (possibly after editing it).
  if (body.draft) {
    try {
      const { path, created } = await saveBookNote(body.draft);
      return NextResponse.json({ saved: true, path, created });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
  }

  const conversationId = body.conversationId;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  const conversation = getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "No such conversation" }, { status: 404 });
  }

  const history = listMessages(conversationId)
    .slice(-MAX_TURNS)
    .map((m) => `${m.role === "user" ? "Salvatore" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  if (!history.trim()) {
    return NextResponse.json({ error: "This conversation is empty." }, { status: 400 });
  }

  try {
    const backend = backendFor(conversation.backend as BackendKind);
    const ask = () =>
      backend.chatComplete(conversation.modelId, [
        { role: "system", content: BOOK_NOTE_PROMPT },
        { role: "user", content: history },
      ]);

    // One retry. A model being swapped out of VRAM can return an empty or
    // truncated reply, and asking again costs a few seconds — far better than
    // telling someone their book could not be identified when it plainly was.
    let draft = parseBookNoteDraft(await ask());
    if (!draft) draft = parseBookNoteDraft(await ask());
    if (!draft) {
      return NextResponse.json(
        { error: "No book could be identified in this conversation — say which book it is, then try again." },
        { status: 422 },
      );
    }
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
