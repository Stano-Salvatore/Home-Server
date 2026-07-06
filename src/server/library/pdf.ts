import { PDFParse } from "pdf-parse";

export type ParsedPdf = {
  title: string | null;
  author: string | null;
  text: string;
};

export async function parsePdf(fileBuffer: Buffer): Promise<ParsedPdf> {
  // pdf-parse hands `data` to a fake worker via postMessage/structuredClone,
  // which throws DataCloneError on a Node Buffer (extra prototype baggage
  // beyond a plain Uint8Array) — so strip it down first.
  const data = new Uint8Array(fileBuffer);
  const parser = new PDFParse({ data });
  try {
    const info = await parser.getInfo();
    const text = await parser.getText();
    return {
      title: (info.info?.Title as string) || null,
      author: (info.info?.Author as string) || null,
      text: text.text,
    };
  } finally {
    await parser.destroy();
  }
}
