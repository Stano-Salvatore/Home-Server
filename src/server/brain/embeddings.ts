import { loadSettings } from "@/server/settings/config";
import { embed as ollamaEmbed } from "@/server/backends/ollama";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddingModel, embeddingHost } = loadSettings();
  return ollamaEmbed(texts, embeddingModel, embeddingHost);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}
