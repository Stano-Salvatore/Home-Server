import { htmlToText } from "html-to-text";
import { loadSettings } from "@/server/settings/config";

// Web search with pluggable providers, Odysseus-style: SearXNG (self-hosted,
// keeps the whole pipeline on your own boxes), DuckDuckGo (zero-setup, no
// key), Brave (API key). Every provider degrades to [] on any failure —
// web grounding is an extra, never a reason for a reply to break.

export type WebHit = { title: string; url: string; snippet: string };

const FETCH_TIMEOUT_MS = 10000;
const UA = "HomeServer/1.0 (local AI dashboard)";

function stripTags(html: string): string {
  return htmlToText(html, { wordwrap: false }).replace(/\s+/g, " ").trim();
}

async function searxng(query: string, count: number): Promise<WebHit[]> {
  const base = loadSettings().searxngUrl.trim().replace(/\/$/, "");
  if (!base) return [];
  const res = await fetch(
    `${base}/search?q=${encodeURIComponent(query)}&format=json&safesearch=0`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "User-Agent": UA } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (data.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, count)
    .map((r) => ({ title: r.title!, url: r.url!, snippet: (r.content ?? "").slice(0, 300) }));
}

// DuckDuckGo's plain-HTML endpoints. No API key, but it's scraping — kept
// deliberately regex-simple, and any parse failure just yields []. The
// html. host is tried first, lite. as fallback (they rate-limit/403
// independently, and datacenter IPs are blocked on both — from a phone on a
// residential/mobile IP this generally works).
function resolveDdgUrl(href: string): string | null {
  // DDG wraps targets in a redirect: //duckduckgo.com/l/?uddg=<encoded>
  const uddg = href.match(/uddg=([^&"]+)/);
  const url = uddg ? decodeURIComponent(uddg[1]) : href;
  return url.startsWith("http") ? url : null;
}

async function duckduckgo(query: string, count: number): Promise<WebHit[]> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) HomeServer/1.0",
  };

  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers,
  }).catch(() => null);
  if (res?.ok) {
    const html = await res.text();
    const hits: WebHit[] = [];
    const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets = [...html.matchAll(snippetRe)].map((m) => stripTags(m[1]));
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = linkRe.exec(html)) && hits.length < count) {
      const url = resolveDdgUrl(m[1]);
      if (url) hits.push({ title: stripTags(m[2]), url, snippet: (snippets[i] ?? "").slice(0, 300) });
      i++;
    }
    if (hits.length > 0) return hits;
  }

  // Fallback: the lite endpoint (table markup, more tolerant of odd clients).
  const lite = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers,
  }).catch(() => null);
  if (!lite?.ok) return [];
  const html = await lite.text();
  const hits: WebHit[] = [];
  const linkRe = /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g;
  const snippets = [...html.matchAll(snippetRe)].map((m) => stripTags(m[1]));
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(html)) && hits.length < count) {
    const url = resolveDdgUrl(m[1]);
    if (url) hits.push({ title: stripTags(m[2]), url, snippet: (snippets[i] ?? "").slice(0, 300) });
    i++;
  }
  return hits;
}

async function brave(query: string, count: number): Promise<WebHit[]> {
  const key = loadSettings().braveApiKey.trim();
  if (!key) return [];
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
    {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "X-Subscription-Token": key, Accept: "application/json" },
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, count)
    .map((r) => ({
      title: r.title!,
      url: r.url!,
      snippet: stripTags(r.description ?? "").slice(0, 300),
    }));
}

export async function webSearch(query: string, count = 5): Promise<WebHit[]> {
  const provider = loadSettings().webSearchProvider;
  try {
    if (provider === "searxng") return await searxng(query, count);
    if (provider === "brave") return await brave(query, count);
    if (provider === "duckduckgo") return await duckduckgo(query, count);
    return []; // "disabled"
  } catch {
    return [];
  }
}

/** Fetch one result page and reduce it to readable text (for deep research). */
export async function fetchPageText(url: string, maxChars = 4000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;
    const html = await res.text();
    const text = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: "nav", format: "skip" },
        { selector: "header", format: "skip" },
        { selector: "footer", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
      ],
    })
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text ? text.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
