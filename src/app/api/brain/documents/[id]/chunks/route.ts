import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { brainChunks } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/brain/documents/[id]/chunks">,
) {
  const { id } = await ctx.params;
  const chunks = db
    .select({
      id: brainChunks.id,
      chunkIndex: brainChunks.chunkIndex,
      content: brainChunks.content,
      tokenCount: brainChunks.tokenCount,
    })
    .from(brainChunks)
    .where(eq(brainChunks.documentId, id))
    .orderBy(brainChunks.chunkIndex)
    .all();
  return NextResponse.json({ chunks });
}
