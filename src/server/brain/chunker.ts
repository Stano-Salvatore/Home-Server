const TARGET_CHUNK_CHARS = 1000;
const MIN_CHUNK_CHARS = 200;

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > TARGET_CHUNK_CHARS && current.length >= MIN_CHUNK_CHARS) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }

    // A single paragraph longer than the target on its own: hard-split it.
    while (current.length > TARGET_CHUNK_CHARS * 1.5) {
      chunks.push(current.slice(0, TARGET_CHUNK_CHARS).trim());
      current = current.slice(TARGET_CHUNK_CHARS);
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [text.trim()].filter(Boolean);
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
