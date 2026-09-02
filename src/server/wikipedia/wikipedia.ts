import { htmlToText } from "html-to-text";
import { loadSettings } from "@/server/settings/config";

export type WikiHit = {
  title: string;
  extract: string;
  lang: string;
  url: string;
  /** Which work this came from; defaults to Wikipedia when absent. */
  source?: string;
};

const MAX_EXTRACT_CHARS = 1500;
const FETCH_TIMEOUT_MS = 8000;

function langsList(): string[] {
  return loadSettings()
    .wikipediaLangs.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

/** Extra local ZIMs (dictionaries) consulted alongside the encyclopedias. */
function extraBooksList(): string[] {
  return loadSettings()
    .kiwixExtraBooks.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
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

// Kiwix's /suggest is a title-prefix matcher: it answers "Vladimír Boudník"
// but not "Kto bol Vladimír Boudník? Krátko." — so a natural question found
// nothing and the whole offline path looked dead. Strip the question scaffolding
// (cs/sk/en) before suggesting, and when even that finds no title, fall back to
// kiwix's Xapian fulltext /search and take its top result.
// A dictionary makes this sharper still: encyclopedia articles are long enough
// that a sloppy fulltext query still overlaps them, but a Wiktionary entry for
// "memento mori" is a few lines and matches nothing unless the term arrives
// nearly bare. Hence two extra steps: quoted phrases win outright (people
// quote the term they're asking about), and the stopword list covers the
// vocabulary of asking-what-something-means.
const QUESTION_NOISE = new Set([
  // sk/cs
  "kto", "kdo", "bol", "byl", "bola", "byla", "je", "sú", "jsou", "čo", "co",
  "aký", "jaký", "aká", "jaká", "ake", "aké", "jaké", "kde", "kedy", "kdy",
  "prečo", "proč", "ako", "jak", "ktorý", "který", "ktorá", "která", "mi", "o",
  "povedz", "řekni", "krátko", "krátce", "stručne", "stručně",
  "znamená", "znamena", "znamenať", "znamenat", "slovo", "fráza", "fráze",
  "výraz", "vysvetli", "vysvětli", "doslova", "znamenají", "znamenajú",
  // en
  "who", "what", "was", "is", "are", "were", "the", "a", "an", "tell", "me",
  "about", "briefly", "please", "short",
  "does", "do", "did", "mean", "means", "meaning", "meant", "literally",
  "literal", "phrase", "word", "term", "expression", "use", "used", "using",
  "come", "comes", "from", "in", "of", "and", "or", "to", "it", "this", "that",
  "explain", "define", "definition", "say", "says", "origin", "where",
]);

/**
 * A quoted phrase is the term being asked about — search that, not the
 * question. Delimiters must sit at a word boundary, or the apostrophes inside
 * "don't ... isn't" would read as a quotation, and French terms like
 * trompe-l'œil would be torn in half.
 */
function quotedPhrase(query: string): string | null {
  const m = query.match(/(?:^|\s)["“„«']([^"“”„«»']{2,60})["“”»'](?=$|[\s,.!?;:])/);
  return m ? m[1].trim() : null;
}

function stripQuestionNoise(query: string): string {
  const quoted = quotedPhrase(query);
  if (quoted) return quoted;
  const cleaned = query
    .replace(/[?!.,;:"„“]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !QUESTION_NOISE.has(w.toLowerCase()))
    .join(" ")
    .trim();
  return cleaned || query;
}

async function kiwixFulltextBook(
  root: string,
  book: string,
  query: string,
  lang: string,
): Promise<WikiHit | null> {
  try {
    const url = `${root}/search?books.name=${encodeURIComponent(book)}&pattern=${encodeURIComponent(query)}&pageLength=3`;
    const html = await fetchText(url);
    const m = html.match(new RegExp(`href="/content/${book}/([^"]+)"`));
    if (!m) return null;
    const path = decodeURIComponent(m[1]);
    const page = await fetchText(`${root}/content/${book}/${m[1]}`);
    const text = htmlToText(page, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }] });
    const extract = text.replace(/\s+\n/g, "\n").trim().slice(0, MAX_EXTRACT_CHARS);
    if (!extract) return null;
    const title = path.split("/").pop()?.replace(/_/g, " ") ?? query;
    return { title, extract, lang, url: `${root}/viewer#${book}/${m[1]}` };
  } catch {
    return null;
  }
}

function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Does a prefix-matcher's answer actually correspond to what was asked? */
function titleMatchesTerm(title: string, term: string): boolean {
  const t = foldAccents(title).trim();
  const q = foldAccents(term).trim();
  if (!t || !q) return false;
  if (t.includes(q) || q.includes(t)) return true;
  // Accept a shared substantial word, so "Vladimir Boudnik grafik" still
  // matches the article "Vladimír Boudník".
  const titleWords = new Set(t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
  return q.split(/[^\p{L}\p{N}]+/u).some((w) => w.length >= 4 && titleWords.has(w));
}

async function kiwixSearchBook(kiwixUrl: string, book: string, query: string, lang: string): Promise<WikiHit | null> {
  try {
    const root = kiwixUrl.replace(/\/$/, "");
    const term = stripQuestionNoise(query);
    const suggestUrl = `${root}/suggest?content=${encodeURIComponent(book)}&term=${encodeURIComponent(term)}`;
    const suggestions = (await fetchJson(suggestUrl)) as { value?: string; label?: string; path?: string }[];
    const top = suggestions.find((s) => s.value || s.path);
    // Kiwix's suggester answers even a misspelling with its nearest title —
    // "toscin" comes back as "Arturo Toscanini". Grounding on that cites a
    // conductor at someone asking about an alarm bell, so an answer that
    // doesn't correspond to the term is discarded and the query goes to
    // fulltext instead, which legitimately returns differently-titled
    // articles ("faux pas" -> a glossary of French expressions).
    if (!top || !titleMatchesTerm(top.value ?? "", term)) {
      return await kiwixFulltextBook(root, book, term, lang);
    }
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

function kiwixUrls(): string[] {
  return loadSettings()
    .kiwixUrl.split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * Search across one or more Kiwix hosts, trying each in order for every
 * language. This lets a small local ZIM (e.g. on the S25) answer common topics
 * fast, and a big offline ZIM on another box (e.g. the Doogee) catch the rest.
 */
async function kiwixSearch(query: string, urls: string[], langs: string[]): Promise<WikiHit[]> {
  const booksCache = new Map<string, string[]>();
  const booksOf = async (url: string) => {
    if (!booksCache.has(url)) booksCache.set(url, await kiwixBooks(url));
    return booksCache.get(url)!;
  };

  const hits: WikiHit[] = [];
  for (const lang of langs) {
    for (const url of urls) {
      const books = await booksOf(url);
      // Match a served book to the language, e.g. "wikipedia_en_all_nopic_2024".
      // Prefer actual wikipedia books: with Gutenberg/Wikisource ZIMs on the
      // same host, "gutenberg_en_all" sorts before "wikipedia_en_all" and would
      // hijack every English query.
      const langRe = new RegExp(`[_.-]${lang}[_.-]`);
      const book =
        books.find((b) => b.startsWith("wikipedia") && langRe.test(b)) ??
        books.find((b) => langRe.test(b)) ??
        // Single-ZIM hosts (a phone serving one book) don't encode a language
        // we can match; with a whole shelf served, a language we don't have is
        // simply absent — searching some unrelated book instead would be worse
        // than returning nothing for it.
        (books.length === 1 ? books[0] : undefined);
      if (!book) continue;
      const hit = await kiwixSearchBook(url, book, query, lang);
      if (hit) {
        hits.push(hit);
        break; // got this language from a host — don't hit the fallback host too
      }
    }
  }

  // Dictionaries and other reference ZIMs, matched by name rather than by
  // language: one English Wiktionary covers Latin, French and everything else
  // borrowed into the books Salvatore reads.
  for (const wanted of extraBooksList()) {
    for (const url of urls) {
      const book = (await booksOf(url)).find((b) => b.startsWith(wanted));
      if (!book) continue;
      const [work, lang] = book.split("_");
      const hit = await kiwixSearchBook(url, book, query, lang ?? "ref");
      if (hit) {
        hits.push({ ...hit, source: work.charAt(0).toUpperCase() + work.slice(1) });
        break;
      }
    }
  }
  return hits;
}

async function onlineSearch(query: string, langs: string[]): Promise<WikiHit[]> {
  const results = await Promise.all(langs.map((l) => onlineSearchLang(query, l)));
  return results.filter((h): h is WikiHit => h !== null);
}

/**
 * One-edit neighbours of a word: adjacent transpositions and single deletions.
 * Those two cover the typos people actually make — "toscin" is a transposition
 * of "tocsin" — and unlike substitutions and insertions there is only a
 * handful, so every one can be probed against the local index in the time a
 * remote spellchecker would need to answer once. Multi-word terms are left
 * alone: a phrase that missed is rarely one keystroke from a real title.
 */
function typoVariants(term: string): string[] {
  const w = term.trim();
  if (!/^\p{L}{4,20}$/u.test(w)) return [];
  const out = new Set<string>();
  for (let i = 0; i < w.length - 1; i++) {
    out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  }
  for (let i = 0; i < w.length; i++) out.add(w.slice(0, i) + w.slice(i + 1));
  out.delete(w);
  return [...out];
}

/** Real titles a single typo away from a term that found nothing. */
async function kiwixNearbyTitles(
  term: string,
  urls: string[],
  langs: string[],
): Promise<string[]> {
  const variants = typoVariants(term);
  if (variants.length === 0) return [];
  const found: string[] = [];
  for (const url of urls) {
    const books = await kiwixBooks(url);
    // The dictionary first — it holds plain words, where a typo is likeliest —
    // then the reader's own languages.
    const candidates = [
      ...extraBooksList().flatMap((w) => books.filter((b) => b.startsWith(w))),
      ...langs.flatMap((l) =>
        books.filter((b) => b.startsWith("wikipedia") && new RegExp(`[_.-]${l}[_.-]`).test(b)),
      ),
    ].slice(0, 2);
    for (const book of candidates) {
      const results = await Promise.all(
        variants.map(async (v) => {
          try {
            const s = (await fetchJson(
              `${url}/suggest?content=${encodeURIComponent(book)}&term=${encodeURIComponent(v)}`,
            )) as { value?: string }[];
            const top = s[0]?.value;
            // Strict here: a suggestion for a typo variant only counts when it
            // IS that word. Anything looser would offer "did you mean
            // Toscanini?" to someone who typed an alarm bell.
            return top && foldAccents(top) === foldAccents(v) ? top : null;
          } catch {
            return null;
          }
        }),
      );
      for (const t of results) {
        if (t && !found.some((f) => foldAccents(f) === foldAccents(t))) found.push(t);
      }
      if (found.length >= 4) return found.slice(0, 4);
    }
  }
  return found.slice(0, 4);
}

export type WikiLookup = { hits: WikiHit[]; nearby: string[] };

/**
 * Retrieve grounding from the encyclopedias and the dictionary. When nothing
 * matches, `nearby` carries real titles a single typo away, so the reply can
 * ask "did you mean…" instead of inventing a meaning or going silent.
 * Never throws.
 */
export async function wikipediaLookup(query: string): Promise<WikiLookup> {
  const settings = loadSettings();
  const langs = langsList();
  try {
    if (settings.wikipediaProvider === "kiwix") {
      const urls = kiwixUrls();
      if (urls.length) {
        const hits = await kiwixSearch(query, urls, langs);
        const term = stripQuestionNoise(query);
        const exact = hits.some((h) => foldAccents(h.title) === foldAccents(term));
        if (hits.length > 0 && exact) return { hits, nearby: [] };
        // Either nothing matched, or only loosely: a prefix matcher answers
        // "toscin" with "Arturo Toscinini", which contains the string without
        // being the word. An exact hit on a one-edit neighbour ("tocsin")
        // beats that. When no neighbour is a real title — "explosionalism"
        // legitimately finding "Explosionalismus" — the loose hit stands.
        const nearby = await kiwixNearbyTitles(term, urls, langs);
        if (nearby.length > 0) return { hits: [], nearby };
        if (hits.length > 0) return { hits, nearby: [] };
      }
      // No offline hit — fall back to the live API if we happen to be online.
      return { hits: await onlineSearch(query, langs), nearby: [] };
    }
    return { hits: await onlineSearch(query, langs), nearby: [] };
  } catch {
    return { hits: [], nearby: [] };
  }
}

/** Retrieve grounding context from Wikipedia for a query. Never throws. */
export async function wikipediaSearch(query: string): Promise<WikiHit[]> {
  return (await wikipediaLookup(query)).hits;
}
