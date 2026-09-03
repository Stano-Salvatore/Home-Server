import type { BuiltinTool } from "./types";

// Looking for work, from the chat window.
//
// Unlike the book-note experiment, this is a genuine fit for a planner tool:
// the request itself carries everything the tool needs ("nájdi mi prácu ako
// učiteľ angličtiny v Bratislave" has both the keywords and the place), so
// planning from the latest message alone loses nothing.
//
// profesia.sk is the Slovak market. RemoteOK is added only when remote work is
// asked for, because its listings are overwhelmingly English-language software
// roles and would otherwise drown out local results.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HomeServer/1.0";
const TIMEOUT = 20000;

// profesia files jobs under region slugs; these are the ones worth mapping.
const REGIONS: Record<string, string> = {
  bratislava: "bratislavsky-kraj",
  "bratislavský kraj": "bratislavsky-kraj",
  trnava: "trnavsky-kraj",
  trenčín: "trenciansky-kraj",
  nitra: "nitriansky-kraj",
  žilina: "zilinsky-kraj",
  "banská bystrica": "banskobystricky-kraj",
  prešov: "presovsky-kraj",
  košice: "kosicky-kraj",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const text = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

type Listing = { title: string; employer: string; location: string; url: string };

function parseProfesia(html: string, limit: number): Listing[] {
  const out: Listing[] = [];
  // Each result is one <li class="list-row"> — split on it rather than trying
  // to match the whole record in a single expression.
  for (const block of html.split('class="list-row"').slice(1)) {
    const title = block.match(/<span class='title'>([\s\S]*?)<\/span>/)?.[1];
    if (!title) continue;
    const href = block.match(/href="([^"]*\/praca\/[^"]*)"/)?.[1] ?? "";
    out.push({
      title: text(title),
      employer: text(block.match(/<span class='employer'>([\s\S]*?)<\/span>/)?.[1] ?? "") || "—",
      location: text(block.match(/class='job-location'>([\s\S]*?)<\/span>/)?.[1] ?? "") || "—",
      url: href ? `https://www.profesia.sk${decodeEntities(href).split("?")[0]}` : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchProfesia(keywords: string, location: string, limit: number): Promise<Listing[]> {
  const region = REGIONS[location.trim().toLowerCase()];
  const base = region ? `https://www.profesia.sk/praca/${region}/` : "https://www.profesia.sk/praca/";
  const url = `${base}?search_anywhere=${encodeURIComponent(keywords)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) return [];
  return parseProfesia(await res.text(), limit);
}

async function searchRemoteOk(keywords: string, limit: number): Promise<Listing[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { position?: string; company?: string; location?: string; url?: string; tags?: string[] }[];
  const words = keywords.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return data
    .filter((j) => j.position)
    .filter((j) => {
      const hay = `${j.position} ${j.company} ${(j.tags ?? []).join(" ")}`.toLowerCase();
      return words.length === 0 || words.some((w) => hay.includes(w));
    })
    .slice(0, limit)
    .map((j) => ({
      title: j.position!,
      employer: j.company ?? "—",
      location: j.location || "remote",
      url: j.url ?? "",
    }));
}

function render(source: string, listings: Listing[]): string {
  if (listings.length === 0) return `${source}: nothing matched.`;
  return (
    `${source} — ${listings.length} openings:\n` +
    listings
      .map((l, i) => `${i + 1}. ${l.title} — ${l.employer} (${l.location})\n   ${l.url}`)
      .join("\n")
  );
}

export const JOB_TOOLS: BuiltinTool[] = [
  {
    name: "search_jobs",
    description:
      "Search for job openings. Use whenever the user asks about finding work, vacancies, " +
      'or job offers ("nájdi mi prácu", "hľadám prácu ako…", "are there any jobs for…"). ' +
      "Searches profesia.sk, the Slovak job board. Set `remote` to true only when the user " +
      "asks for remote or worldwide work, which also searches RemoteOK.",
    argsHint:
      "keywords (string, required): what the job is, e.g. 'lektor anglického jazyka' or 'frontend developer'; " +
      "location (string): a Slovak city or region, e.g. 'Bratislava'; remote (boolean): also search remote listings",
    call: async (args) => {
      // A small planner names arguments from the meaning of the question, not
      // from the schema: asked for a teaching job it emitted `profession`
      // rather than `keywords`, the tool saw nothing, and the reply became a
      // polite request for information the user had already given. Accepting
      // the obvious synonyms costs nothing and removes a whole class of that.
      const pick = (...names: string[]) => {
        for (const n of names) {
          const v = args[n];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
        return "";
      };
      const keywords = pick("keywords", "profession", "query", "job", "role", "position", "search", "what");
      const location = pick("location", "city", "region", "place", "where");
      const remote = args.remote === true || args.remote === "true";
      if (!keywords) return "No search terms were given — ask what kind of work to look for.";

      const parts: string[] = [];
      try {
        parts.push(render(`profesia.sk${location ? ` (${location})` : ""}`, await searchProfesia(keywords, location, 10)));
      } catch (err) {
        parts.push(`profesia.sk could not be reached: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (remote) {
        try {
          parts.push(render("RemoteOK", await searchRemoteOk(keywords, 8)));
        } catch {
          parts.push("RemoteOK could not be reached.");
        }
      }
      return parts.join("\n\n");
    },
  },
];
