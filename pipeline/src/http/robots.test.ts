import { describe, expect, it } from 'vitest';

import { groupsFor, isPathAllowed, parseRobots, policyFromText } from './robots.ts';

const allowed = (text: string, path: string, token = 'sarvis') =>
  policyFromText(text, token).isAllowed(path);

describe('parseRobots', () => {
  it('groups consecutive User-agent lines, ignores comments and unknown fields', () => {
    const groups = parseRobots(
      [
        '# comment',
        'User-agent: A',
        'User-agent: B # trailing',
        'Disallow: /x',
        'Sitemap: https://example.org/sitemap.xml',
        'User-agent: *',
        'Disallow:',
        'Crawl-delay: 5',
      ].join('\r\n'),
    );
    expect(groups).toEqual([
      { agents: ['a', 'b'], rules: [{ allow: false, pattern: '/x' }] },
      { agents: ['*'], rules: [], crawlDelaySec: 5 },
    ]);
  });
});

describe('group selection', () => {
  const text = 'User-agent: *\nDisallow: /\n\nUser-agent: Sarvis\nDisallow: /private\n';

  it('uses the group naming us over *', () => {
    expect(allowed(text, '/products')).toBe(true);
    expect(allowed(text, '/private/1')).toBe(false);
  });

  it('falls back to * for other agents', () => {
    expect(allowed(text, '/products', 'otherbot')).toBe(false);
  });

  it('merges every group that names us', () => {
    const merged = groupsFor(
      parseRobots('User-agent: sarvis\nDisallow: /a\nUser-agent: sarvis\nDisallow: /b\n'),
      'sarvis',
    );
    expect(isPathAllowed(merged, '/a')).toBe(false);
    expect(isPathAllowed(merged, '/b')).toBe(false);
    expect(isPathAllowed(merged, '/c')).toBe(true);
  });

  it('allows everything with no robots groups', () => {
    expect(allowed('', '/anything')).toBe(true);
  });
});

describe('rule matching', () => {
  it('picks the longest match, and Allow on a tie', () => {
    const text =
      'User-agent: *\nDisallow: /shop\nAllow: /shop/public\nAllow: /tie\nDisallow: /tie\n';
    expect(allowed(text, '/shop/cart')).toBe(false);
    expect(allowed(text, '/shop/public/1')).toBe(true);
    expect(allowed(text, '/tie')).toBe(true);
  });

  it('supports * wildcards and the $ end anchor, including the query', () => {
    const text = 'User-agent: *\nDisallow: /*.json$\nDisallow: /search?*q=\n';
    expect(allowed(text, '/data/products.json')).toBe(false);
    expect(allowed(text, '/data/products.json?page=2')).toBe(true);
    expect(allowed(text, '/search?page=1&q=milk')).toBe(false);
    expect(allowed(text, '/search')).toBe(true);
  });

  it('escapes regex characters in patterns', () => {
    expect(allowed('User-agent: *\nDisallow: /a.b\n', '/axb')).toBe(true);
    expect(allowed('User-agent: *\nDisallow: /a.b\n', '/a.b/c')).toBe(false);
  });

  it('always allows /robots.txt', () => {
    expect(allowed('User-agent: *\nDisallow: /\n', '/robots.txt')).toBe(true);
  });
});

describe('Crawl-delay', () => {
  it('reads our group’s delay in ms', () => {
    expect(policyFromText('User-agent: sarvis\nCrawl-delay: 2.5\n', 'sarvis').crawlDelayMs).toBe(
      2500,
    );
    expect(policyFromText('User-agent: *\nDisallow: /x\n', 'sarvis').crawlDelayMs).toBe(0);
  });
});
