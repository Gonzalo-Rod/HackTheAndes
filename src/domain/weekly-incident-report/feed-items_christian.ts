import { z } from "zod";

import { safeHttpUrl } from "@/domain/road-alerts/parsing";

// RSS 2.0 reader for the feeds the weekly report uses (Google News search, INDECI's
// emergency reports). Only the fields the report needs are read; items without a title or an
// http(s) link are dropped. Pure functions, no XML dependency.

/** Upper bound on items read from one feed; the largest feed read on 2026-10-17 had 100 items. */
const MAX_ITEMS_PER_FEED = 500;

export const FeedItemSchema = z.object({
  title: z.string().min(1),
  link: z.url(),
  /** Publication time as ISO 8601 in UTC, or null when missing or unparseable. */
  publishedAt: z.iso.datetime().nullable(),
  /** Publisher from <source> (Google News adds it), or null. */
  sourceName: z.string().nullable(),
  /** <description> with CDATA unwrapped. INDECI puts the report's occurrence table here. */
  description: z.string().nullable(),
});

export type FeedItem = z.infer<typeof FeedItemSchema>;

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";

function decodeCharacterReferences(value: string): string {
  const character = (value: number): string =>
    Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value)
      : "\uFFFD";
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => character(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => character(Number(dec)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
}

/** Decodes the XML/HTML entities that appear in the feeds; CDATA sections are kept literally, as in XML. */
export function decodeEntities(value: string): string {
  return value
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) => (part.startsWith(CDATA_OPEN) ? part.slice(CDATA_OPEN.length, -CDATA_CLOSE.length) : decodeCharacterReferences(part)))
    .join("");
}

function readElement(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

function toIsoOrNull(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    if (items.length >= MAX_ITEMS_PER_FEED) break;
    const body = match[1];
    const parsed = FeedItemSchema.safeParse({
      title: readElement(body, "title") ?? "",
      link: safeHttpUrl(readElement(body, "link")),
      publishedAt: toIsoOrNull(readElement(body, "pubDate")),
      sourceName: readElement(body, "source") || null,
      description: readElement(body, "description") || null,
    });
    if (parsed.success) items.push(parsed.data);
  }
  return items;
}

/** Rejects HTML error pages, truncated feeds and invalid items instead of reporting a successful empty read. */
export function parseFeedDocument(xml: string): { ok: true; items: FeedItem[] } | { ok: false; error: "invalid_feed" } {
  // Strip CDATA and comments before checking structure: descriptions may contain literal tags.
  const structure = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, "");
  if (!/<rss\b[^>]*>\s*<channel\b[^>]*>[\s\S]*<\/channel>\s*<\/rss>\s*$/i.test(structure)) {
    return { ok: false, error: "invalid_feed" };
  }
  const opened = [...structure.matchAll(/<item(?:\s[^>]*)?>/gi)].length;
  const closed = [...structure.matchAll(/<\/item>/gi)].length;
  const items = parseFeedItems(xml);
  return opened === closed && opened === items.length ? { ok: true, items } : { ok: false, error: "invalid_feed" };
}
