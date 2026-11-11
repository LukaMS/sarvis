// Which category a product's OFF tags give it (TAXONOMY.md §3, D-090). P4.8 measures coverage
// with it, and the P4.9 `categorize-tags` job applies it.
//
// Among the product's tags that have a mapping, the winner is the one whose category is deepest
// (a leaf beats a group beats an aisle). A tie goes to the higher confidence (a weak tag loses),
// then to the tag listed later, since OFF lists a product's tags from general to specific.

export interface TagMapping {
  /** The category slug; its depth is the number of `/` in it. */
  slug: string;
  confidence: number;
}

export interface TagPick {
  tag: string;
  slug: string;
  level: number;
  confidence: number;
}

export const levelOf = (slug: string) => slug.split('/').length - 1;

/** OFF's comma-separated `categories_tags`, trimmed, without blanks. */
export const splitTags = (tags: string) =>
  tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');

export function pickCategory(
  tags: readonly string[],
  mappings: ReadonlyMap<string, TagMapping>,
): TagPick | null {
  let best: TagPick | null = null;
  for (const tag of tags) {
    const m = mappings.get(tag);
    if (!m) continue;
    const level = levelOf(m.slug);
    if (!best || level > best.level || (level === best.level && m.confidence >= best.confidence)) {
      best = { tag, slug: m.slug, level, confidence: m.confidence };
    }
  }
  return best;
}
