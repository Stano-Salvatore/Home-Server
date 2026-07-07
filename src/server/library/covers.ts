import fs from "node:fs";
import path from "node:path";

const COVERS_DIR = path.join(process.cwd(), "data", "covers");
const COVER_COLORS = ["#4f46e5", "#0891b2", "#b91c1c", "#15803d", "#a16207", "#7e22ce"];

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_COLORS[hash % COVER_COLORS.length];
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, 5);
}

// Placeholder covers are emitted as plain SVG (rendered directly by <img>) so
// we don't need a native rasterizer like sharp — which can't compile on
// Android/Termux. Real embedded covers are stored as-is, unresized.
function placeholderSvg(title: string, author: string | null): string {
  const color = pickColor(title);
  const titleLines = wrapText(title, 18);
  const titleTspans = titleLines
    .map((line, i) => `<tspan x="150" dy="${i === 0 ? 0 : 32}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<svg width="300" height="450" xmlns="http://www.w3.org/2000/svg">
  <rect width="300" height="450" fill="${color}"/>
  <text x="150" y="${180 - titleLines.length * 16}" font-family="sans-serif" font-size="26" font-weight="bold" fill="white" text-anchor="middle">${titleTspans}</text>
  ${author ? `<text x="150" y="400" font-family="sans-serif" font-size="16" fill="white" opacity="0.85" text-anchor="middle">${escapeXml(author)}</text>` : ""}
</svg>`;
}

function extFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("svg")) return "svg";
  return "img";
}

export async function saveCover(
  bookId: string,
  cover: { data: Buffer; mimeType: string } | null,
  fallbackTitle: string,
  fallbackAuthor: string | null,
): Promise<string> {
  fs.mkdirSync(COVERS_DIR, { recursive: true });

  let buffer: Buffer;
  let ext: string;
  if (cover) {
    buffer = cover.data;
    ext = extFromMime(cover.mimeType);
  } else {
    buffer = Buffer.from(placeholderSvg(fallbackTitle, fallbackAuthor), "utf-8");
    ext = "svg";
  }

  const coverPath = path.join(COVERS_DIR, `${bookId}.${ext}`);
  fs.writeFileSync(coverPath, buffer);
  return coverPath;
}
