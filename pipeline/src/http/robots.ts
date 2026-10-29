// A small robots.txt parser and matcher (RFC 9309): User-agent, Allow, Disallow and the non-standard
// Crawl-delay. In-repo rather than a dependency, because the subset we need is small.

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  /** User-agent values, lower case. */
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySec?: number;
}

/** What one origin's robots.txt allows for our User-Agent. */
export interface RobotsPolicy {
  isAllowed(pathAndQuery: string): boolean;
  /** Crawl-delay for our group, in ms; 0 when there is none. */
  crawlDelayMs: number;
}

/** RFC 9309 §2.5: parsers must handle at least 500 KiB; anything after that is ignored. */
export const MAX_ROBOTS_BYTES = 500 * 1024;

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let inAgentLines = false;

  for (const raw of text.slice(0, MAX_ROBOTS_BYTES).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // Consecutive User-agent lines share one group; one after a rule starts a new group.
      if (!current || !inAgentLines) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgentLines = true;
      continue;
    }
    inAgentLines = false;
    if (!current) continue;

    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow allows everything, which is the default anyway.
      if (value !== '') current.rules.push({ allow: field === 'allow', pattern: value });
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySec = seconds;
    }
  }
  return groups;
}

/**
 * The groups that apply to `productToken` (e.g. "sarvis"): every group naming it, merged, or the
 * `*` groups when none does (RFC 9309 §2.2.1).
 */
export function groupsFor(groups: RobotsGroup[], productToken: string): RobotsGroup[] {
  const token = productToken.toLowerCase();
  const named = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  return named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'));
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Longest matching rule wins; on a tie, Allow wins (RFC 9309 §2.2.2). /robots.txt is always allowed. */
export function isPathAllowed(groups: RobotsGroup[], pathAndQuery: string): boolean {
  if (pathAndQuery === '/robots.txt') return true;
  let best: RobotsRule | undefined;
  for (const rule of groups.flatMap((g) => g.rules)) {
    if (!patternToRegExp(rule.pattern).test(pathAndQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best?.allow ?? true;
}

export function policyFromText(text: string, productToken: string): RobotsPolicy {
  const groups = groupsFor(parseRobots(text), productToken);
  const delays = groups.map((g) => g.crawlDelaySec ?? 0);
  return {
    isAllowed: (pathAndQuery) => isPathAllowed(groups, pathAndQuery),
    crawlDelayMs: Math.max(0, ...delays) * 1000,
  };
}

/** No robots.txt (any 4xx): everything is allowed. */
export const ALLOW_ALL: RobotsPolicy = { isAllowed: () => true, crawlDelayMs: 0 };

/** robots.txt unreachable (5xx or a network error): assume everything is disallowed (RFC 9309 §2.3.1.4). */
export const DISALLOW_ALL: RobotsPolicy = {
  isAllowed: (pathAndQuery) => pathAndQuery === '/robots.txt',
  crawlDelayMs: 0,
};
