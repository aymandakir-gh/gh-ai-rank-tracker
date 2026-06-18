import type { Brand, Citation, MentionResult, CitationResult } from "./types";

/** Minimum prominence credited to any real mention, however late in the text. */
const PROMINENCE_FLOOR = 0.05;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Distinct, non-empty terms that identify a brand in free text. */
export function brandTerms(brand: Brand): string[] {
  const raw = [brand.name, ...(brand.aliases ?? [])]
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/**
 * Build a case-insensitive, boundary-aware matcher for a brand term.
 * Uses Unicode-aware lookarounds so "Notion" does not match "myNotioning",
 * while still allowing punctuation inside the term (e.g. "Cal.com").
 */
function termRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu");
}

/** Convert a first-mention character index into a 0..1 prominence value. */
export function computeProminence(firstIndex: number, textLength: number): number {
  if (firstIndex < 0 || textLength <= 0) return 0;
  const rel = 1 - firstIndex / textLength; // 1 at the very start, ~0 at the end
  return clamp(Math.max(rel, PROMINENCE_FLOOR), 0, 1);
}

/** Detect whether (and how prominently) a brand is mentioned in answer text. */
export function detectMention(text: string, brand: Brand): MentionResult {
  const terms = brandTerms(brand);
  if (!text || terms.length === 0) {
    return { mentioned: false, count: 0, firstIndex: -1, prominence: 0, matchedTerms: [] };
  }

  // Collect every match span across all terms, then count *distinct*
  // occurrences by merging overlapping spans. This prevents double-counting
  // when one term is a punctuation-bounded sub-token of another
  // (e.g. name "Cal" + alias "Cal.com" both match the same "Cal.com" span).
  const spans: Array<[number, number]> = [];
  const matched = new Set<string>();
  for (const term of terms) {
    const re = termRegex(term);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      spans.push([m.index, m.index + m[0].length]);
      matched.add(term);
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-length loops
    }
  }

  if (spans.length === 0) {
    return { mentioned: false, count: 0, firstIndex: -1, prominence: 0, matchedTerms: [] };
  }

  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const firstIndex = spans[0]![0];
  let count = 0;
  let mergedEnd = -1;
  for (const [start, end] of spans) {
    if (start >= mergedEnd) {
      count++; // a new, non-overlapping occurrence
      mergedEnd = end;
    } else if (end > mergedEnd) {
      mergedEnd = end; // overlaps the current span → extend, do not re-count
    }
  }

  return {
    mentioned: true,
    count,
    firstIndex,
    prominence: computeProminence(firstIndex, text.length),
    matchedTerms: [...matched],
  };
}

/** Normalize any URL or host string down to a bare, lowercase hostname. */
export function normalizeDomain(input: string): string {
  if (!input) return "";
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, ""); // strip scheme
  s = s.replace(/^[^@/]*@/, ""); // strip userinfo (user@ / user:pass@) before the host
  s = s.replace(/^www\./, "");
  s = s.split("/")[0]!; // drop path
  s = s.split("?")[0]!; // drop query
  s = s.split("#")[0]!; // drop fragment
  s = s.split(":")[0]!; // drop port
  return s;
}

/** Domains that should be treated as belonging to a brand. */
function brandDomains(brand: Brand): string[] {
  const out: string[] = [];
  if (brand.domain) out.push(normalizeDomain(brand.domain));
  for (const a of brand.aliases ?? []) {
    if (!a.includes(" ") && /\.[a-z]{2,}$/i.test(a)) out.push(normalizeDomain(a));
  }
  return out.filter((d) => d.length > 0);
}

/** Convert a 1-based citation rank into a 0..1 prominence value. */
export function citationProminence(rank: number, total: number): number {
  if (rank < 1) return 0;
  const denom = Math.max(total, 1);
  return clamp(1 - (rank - 1) / denom, 0, 1); // rank 1 => 1.0, last => ~1/denom
}

/** Detect whether (and how prominently) a brand is cited among an answer's sources. */
export function detectCitation(citations: Citation[], brand: Brand): CitationResult {
  const domains = brandDomains(brand);
  if (!citations || citations.length === 0 || domains.length === 0) {
    return { cited: false, rank: -1, count: 0, prominence: 0 };
  }

  let rank = -1;
  let count = 0;
  citations.forEach((c, i) => {
    const host = normalizeDomain(c.url);
    if (!host) return;
    const isMatch = domains.some((d) => host === d || host.endsWith(`.${d}`));
    if (isMatch) {
      count++;
      if (rank === -1) rank = i + 1;
    }
  });

  const cited = count > 0;
  return {
    cited,
    rank,
    count,
    prominence: cited ? citationProminence(rank, citations.length) : 0,
  };
}
