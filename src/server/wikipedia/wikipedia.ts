import { htmlToText } from "html-to-text";
import { loadSettings } from "@/server/settings/config";

export type WikiHit = { title: string; extract: string; lang: string; url: string };

const MAX_EXTRACT_CHARS = 1500;
const FETCH_TIMEOUT_MS = 8000;

function langsList(): string[] {
  return loadSettings()
    .wikipediaLangs.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "HomeServer/1.0 (local AI dashboard)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "HomeServer/1.0 (local AI dashboard)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// --- Online provider: live MediaWiki API (en/cs.wikipedia.org) ---
async function onlineSearchLang(query: string, lang: string): Promise<WikiHit | null> {
  try {
    const base = `https://${lang}.wikipedia.org`;
    const searchUrl = `${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const search = (await fetchJson(searchUrl)) as { query?: { search?: { title: string }[] } };
    const title = search.query?.search?.[0]?.title;
    if (!title) return null;
    const sumUrl = `${base}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    const sum = (await fetchJson(sumUrl)) as {
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!sum.extract) return null;
    return {
      title,
      extract: sum.extract.slice(0, MAX_EXTRACT_CHARS),
      lang,
      url: sum.content_urls?.desktop?.page ?? `${base}/wiki/${encodeURIComponent(title)}`,
    };
  } catch {
    return null;
  }
}

// --- Offline provider: local kiwix-serve ---
async function kiwixBooks(kiwixUrl: string): Promise<string[]> {
  try {
    const xml = await fetchText(`${kiwixUrl.replace(/\/$/, "")}/catalog/v2/entries`);
    // OPDS entries expose the book's url-safe name; grab them defensively.
    const names = [...xml.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    return [...new Set(names)];
  } catch {
    return [];
  }
}

async function kiwixSearchBook(kiwixUrl: string, book: string, query: string, lang: string): Promise<WikiHit | null> {
  try {
    const root = kiwixUrl.replace(/\/$/, "");
    const suggestUrl = `${root}/suggest?content=${encodeURIComponent(book)}&term=${encodeURIComponent(query)}`;
    const suggestions = (await fetchJson(suggestUrl)) as { value?: string; label?: string; path?: string }[];
    const top = suggestions.find((s) => s.value || s.path);
    if (!top) return null;
    const title = top.value ?? "";
    const path = top.path ?? `A/${(title || query).replace(/ /g, "_")}`;
    const html = await fetchText(`${root}/content/${book}/${path}`);
    const text = htmlToText(html, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] });
    const extract = text.replace(/\s+\n/g, "\n").trim().slice(0, MAX_EXTRACT_CHARS);
    if (!extract) return null;
    return { title: title || query, extract, lang, url: `${root}/viewer#${book}/${path}` };
  } catch {
    return null;
  }
}

async function kiwixSearch(query: string, kiwixUrl: string, langs: string[]): Promise<WikiHit[]> {
  const books = await kiwixBooks(kiwixUrl);
  const hits: WikiHit[] = [];
  for (const lang of langs) {
    // Match a served book to the language, e.g. "wikipedia_en_all_nopic_2024".
    const book = books.find((b) => new RegExp(`[_.-]${lang}[_.-]`).test(b)) ?? books[0];
    if (!book) continue;
    const hit = await kiwixSearchBook(kiwixUrl, book, query, lang);
    if (hit) hits.push(hit);
  }
  return hits;
}

/** Retrieve grounding context from Wikipedia for a query. Never throws. */
export async function wikipediaSearch(query: string): Promise<WikiHit[]> {
  const settings = loadSettings();
  const langs = langsList();
  try {
    if (settings.wikipediaProvider === "kiwix" && settings.kiwixUrl) {
      const hits = await kiwixSearch(query, settings.kiwixUrl, langs);
      if (hits.length > 0) return hits;
      // Fall through to online only if no offline hit and it's reachable.
      return [];
    }
    const results = await Promise.all(langs.map((l) => onlineSearchLang(query, l)));
    return results.filter((h): h is WikiHit => h !== null);
  } catch {
    return [];
  }
}
