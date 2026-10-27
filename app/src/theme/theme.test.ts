// Checks the theme against docs/legacy/THEME.md: every token legacy uses must exist with the same value.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import * as theme from './index';
import {
  AppColors,
  Elevation,
  GRADE_THRESHOLDS,
  GradeColors,
  M3Colors,
  Radius,
  RatingBgColors,
  RatingColors,
  Spacing,
  TintAlpha,
  Typography,
  UNRATED_GRADE_COLOR,
  UNRATED_RATING_BG_COLOR,
  UNRATED_RATING_COLOR,
  gradeToColor,
  scoreToGrade,
} from './index';

const THEME_MD = readFileSync(
  resolve(import.meta.dirname, '../../../docs/legacy/THEME.md'),
  'utf8',
);

/** Text under a heading, up to the next heading of the same or a higher level. */
function section(heading: string): string {
  const lines = THEME_MD.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) throw new Error(`THEME.md has no heading starting with "${heading}"`);
  const level = /^#+/.exec(heading)?.[0].length ?? 2;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && /^#+/.exec(l)![0].length <= level,
  );
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** Body rows of the first markdown table in `text`, as trimmed cells. */
function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .slice(2)
    .map((l) =>
      l
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim()),
    );
}

const unquote = (s: string) => s.replace(/`/g, '').trim();
const firstHex = (s: string) => /#[0-9a-fA-F]{6}/.exec(s)?.[0];
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
const m3 = (token: string) => (M3Colors as Record<string, string>)[token];

type Result = {
  group: string;
  key: string;
  status: 'ok' | 'missing' | 'mismatch';
  detail?: string;
};
const results: Result[] = [];

function check(group: string, key: string, actual: unknown, expected: unknown) {
  if (actual === undefined) {
    results.push({ group, key, status: 'missing' });
  } else if (
    typeof expected === 'string' && typeof actual === 'string'
      ? norm(actual) !== norm(expected)
      : actual !== expected
  ) {
    results.push({
      group,
      key,
      status: 'mismatch',
      detail: `theme ${String(actual)} ≠ THEME.md ${String(expected)}`,
    });
  } else {
    results.push({ group, key, status: 'ok' });
  }
}

function checkRange(
  group: string,
  key: string,
  actual: number | undefined,
  min: number,
  max: number,
) {
  if (actual === undefined) results.push({ group, key, status: 'missing' });
  else if (actual < min || actual > max)
    results.push({ group, key, status: 'mismatch', detail: `theme ${actual} ∉ [${min}, ${max}]` });
  else results.push({ group, key, status: 'ok' });
}

const failures = (group: string) => results.filter((r) => r.group === group && r.status !== 'ok');

afterAll(() => {
  const groups = [...new Set(results.map((r) => r.group))];
  const lines = groups.map((g) => {
    const rs = results.filter((r) => r.group === g);
    const n = (s: Result['status']) => rs.filter((r) => r.status === s).length;
    return `${g.padEnd(14)} checked ${String(rs.length).padStart(3)}  missing ${n('missing')}  mismatched ${n('mismatch')}`;
  });
  const bad = results.filter((r) => r.status !== 'ok').length;
  console.log(
    [
      'THEME.md token check',
      ...lines,
      `TOTAL          checked ${results.length}  failures ${bad}`,
    ].join('\n'),
  );
});

describe('theme matches THEME.md', () => {
  it('M3 colours: every token with uses > 0', () => {
    for (const [token, hex, uses] of tableRows(section('## Colour tokens'))) {
      if (Number(uses) > 0) check('m3', unquote(token!), m3(unquote(token!)), unquote(hex!));
    }
    expect(failures('m3')).toEqual([]);
  });

  it('hard-coded colours that screens render', () => {
    const values = Object.values(AppColors).map(norm);
    for (const [value] of tableRows(section('### Hard-coded colours'))) {
      const v = /`([^`]+)`/.exec(value!)?.[1] ?? '';
      // Camera black/white and app.json colours belong to native config, not the theme.
      if (!v.startsWith('rgba') && v !== '#7CFC00') continue;
      check('hardcoded', v, values.includes(norm(v)) ? v : undefined, v);
    }
    expect(failures('hardcoded')).toEqual([]);
  });

  it('tint alpha convention', () => {
    const text = section('### Tint convention');
    check('tint', 'badge', TintAlpha.badge, /\+ `"(\w{2})"`/.exec(text)?.[1]);
    check('tint', 'imagePill', TintAlpha.imagePill, /primaryFixed \+ "(\w{2})"/.exec(text)?.[1]);
    expect(failures('tint')).toEqual([]);
  });

  it('grade colours', () => {
    for (const [grades, token, hex] of tableRows(section('## Grade colours'))) {
      const expected = unquote(hex!).split(' ')[0]!;
      if (grades!.includes('unknown')) {
        check('grades', 'unrated', UNRATED_GRADE_COLOR, expected);
        check('grades', 'gradeToColor(unknown)', gradeToColor('Z'), expected);
        continue;
      }
      for (const g of grades!.split(',').map(unquote)) {
        check('grades', g, (GradeColors as Record<string, string>)[g], expected);
        check('grades', `${g} token`, m3(unquote(token!)), expected);
      }
    }
    expect(failures('grades')).toEqual([]);
  });

  it('scoreToGrade thresholds', () => {
    const line = /Score → grade[^:]*:(.*)$/m.exec(section('## Grade colours'))?.[1] ?? '';
    const expected = [...line.matchAll(/(\d+) ([A-F][+-]?)/g)].map((m) => [Number(m[1]), m[2]]);
    check('scoreToGrade', 'threshold count', GRADE_THRESHOLDS.length, expected.length);
    expected.forEach(([min, grade], i) => {
      check(
        'scoreToGrade',
        `${String(grade)} ≥ ${String(min)}`,
        GRADE_THRESHOLDS[i]?.join(' '),
        `${String(min)} ${String(grade)}`,
      );
    });
    check('scoreToGrade', 'else', /else ([A-F])/.exec(line)?.[1], 'F');
    expect(failures('scoreToGrade')).toEqual([]);
  });

  it('rating colours', () => {
    const resolveCell = (cell: string) => firstHex(cell) ?? m3(cell.split(' ')[0]!);
    for (const [rating, text, bg] of tableRows(section('## Rating colours'))) {
      const r = unquote(rating!);
      if (r === 'none') {
        check('ratings', 'unrated text', UNRATED_RATING_COLOR, resolveCell(text!));
        check('ratings', 'unrated bg', UNRATED_RATING_BG_COLOR, resolveCell(bg!));
      } else {
        check(
          'ratings',
          `${r} text`,
          (RatingColors as Record<string, string>)[r],
          resolveCell(text!),
        );
        check(
          'ratings',
          `${r} bg`,
          (RatingBgColors as Record<string, string>)[r],
          resolveCell(bg!),
        );
      }
    }
    expect(failures('ratings')).toEqual([]);
  });

  it('AppColors aliases that legacy uses', () => {
    const text = section('## Semantic aliases');
    const used = [...text.split('\n')[0]!.matchAll(/`(\w+)`/g)]
      .map((m) => m[1]!)
      .filter((k) => k !== 'AppColors');
    const maps = new Map(tableRows(text).map(([k, v]) => [unquote(k!), unquote(v!)]));
    for (const key of used) {
      const target = maps.get(key)!;
      const expected = target.startsWith('rgba') ? target : (m3(target.split(' ')[0]!) ?? target);
      check('appColors', key, (AppColors as Record<string, string>)[key], expected);
    }
    check('appColors', 'used keys found', used.length, 3);
    expect(failures('appColors')).toEqual([]);
  });

  it('radii', () => {
    for (const [key, px] of tableRows(section('## Radii'))) {
      check('radius', unquote(key!), (Radius as Record<string, number>)[unquote(key!)], Number(px));
    }
    expect(failures('radius')).toEqual([]);
  });

  it('type scale roles', () => {
    const roleKeys: Record<string, keyof typeof Typography> = {
      'Hero title': 'heroTitle',
      'Auth title': 'authTitle',
      'Large card title': 'largeCardTitle',
      Wordmark: 'wordmark',
      'Section header': 'sectionHeader',
      'Card title': 'cardTitle',
      'Body / list title': 'listTitle',
      Body: 'body',
      Secondary: 'secondary',
      Meta: 'meta',
      'Kicker / overline': 'kicker',
      'Tab label': 'tabLabel',
      'Chip label': 'chipLabel',
    };
    for (const [role, rawSpec] of tableRows(section('## Type scale'))) {
      const key = roleKeys[role!];
      if (!key) {
        results.push({
          group: 'typography',
          key: role!,
          status: 'missing',
          detail: 'role not mapped',
        });
        continue;
      }
      const t: {
        fontSize: number;
        fontWeight: string;
        letterSpacing?: number;
        lineHeight?: number;
        textTransform?: string;
      } = Typography[key];
      const spec = rawSpec!.replace(/\([^)]*\)/g, '').replace(/\*\*/g, '');
      const [, s1, s2, w1, w2] = /^(\d+)(?:–(\d+))? \/ (\d+)(?:–(\d+))?/.exec(spec) ?? [];
      checkRange('typography', `${key}.fontSize`, t.fontSize, Number(s1), Number(s2 ?? s1));
      checkRange(
        'typography',
        `${key}.fontWeight`,
        Number(t.fontWeight),
        Number(w1),
        Number(w2 ?? w1),
      );
      const ls = /(?:letterSpacing|ls) (-?[\d.]+)(?:–([\d.]+))?/.exec(spec);
      if (ls)
        checkRange(
          'typography',
          `${key}.letterSpacing`,
          t.letterSpacing,
          Number(ls[1]),
          Number(ls[2] ?? ls[1]),
        );
      const lh = /lineHeight (\d+)/.exec(spec);
      if (lh) check('typography', `${key}.lineHeight`, t.lineHeight, Number(lh[1]));
      if (spec.includes('uppercase'))
        check('typography', `${key}.textTransform`, t.textTransform, 'uppercase');
    }
    expect(failures('typography')).toEqual([]);
  });

  it('spacing', () => {
    const text = section('## Spacing');
    const num = (re: RegExp) => Number(re.exec(text)?.[1]);
    check('spacing', 'screenGutter', Spacing.screenGutter, num(/Screen gutter: (\d+) px/));
    check('spacing', 'tabScreenTop', Spacing.tabScreenTop, num(/insets\.top \+ (\d+)/));
    check('spacing', 'tabBarClearance', Spacing.tabBarClearance, num(/(\d+) \+ insets\.bottom/));
    check('spacing', 'listRowGap', Spacing.listRowGap, num(/(\d+) px between rows/));
    check('spacing', 'storyCardGap', Spacing.storyCardGap, num(/(\d+) between story cards/));
    check('spacing', 'sectionGap', Spacing.sectionGap, num(/`marginBottom` (\d+) under cards/));
    check('spacing', 'scanSectionGap', Spacing.scanSectionGap, num(/(\d+) between scan sections/));
    expect(failures('spacing')).toEqual([]);
  });

  it('elevation', () => {
    const text = section('## Elevation and shadows');
    const tab =
      /Tab bar:\*\* `shadowColor (\w+)`, offset \((-?\d+), (-?\d+)\), opacity ([\d.]+), radius (\d+), `elevation: (\d+)`/.exec(
        text,
      );
    check('elevation', 'tabBar.shadowColor', Elevation.tabBar.shadowColor, m3(tab?.[1] ?? ''));
    check(
      'elevation',
      'tabBar.offset.width',
      Elevation.tabBar.shadowOffset.width,
      Number(tab?.[2]),
    );
    check(
      'elevation',
      'tabBar.offset.height',
      Elevation.tabBar.shadowOffset.height,
      Number(tab?.[3]),
    );
    check('elevation', 'tabBar.opacity', Elevation.tabBar.shadowOpacity, Number(tab?.[4]));
    check('elevation', 'tabBar.radius', Elevation.tabBar.shadowRadius, Number(tab?.[5]));
    check('elevation', 'tabBar.elevation', Elevation.tabBar.elevation, Number(tab?.[6]));
    const laser = /`(#\w{6})` glow, radius (\d+), opacity (\d+(?:\.\d+)?)/.exec(text);
    check('elevation', 'laser.color', Elevation.scannerLaserGlow.shadowColor, laser?.[1]);
    check('elevation', 'laser.radius', Elevation.scannerLaserGlow.shadowRadius, Number(laser?.[2]));
    check(
      'elevation',
      'laser.opacity',
      Elevation.scannerLaserGlow.shadowOpacity,
      Number(laser?.[3]),
    );
    expect(failures('elevation')).toEqual([]);
  });

  it('leaves out the unused Expo template tokens', () => {
    for (const name of ['Colors', 'Fonts', 'BottomTabInset', 'MaxContentWidth', 'ThemeColor']) {
      expect(theme).not.toHaveProperty(name);
    }
  });
});

describe('scoreToGrade boundaries', () => {
  it('maps each threshold to its grade and just below it to the next grade', () => {
    GRADE_THRESHOLDS.forEach(([min, grade], i) => {
      expect(scoreToGrade(min)).toBe(grade);
      expect(scoreToGrade(min - 0.01)).toBe(GRADE_THRESHOLDS[i + 1]?.[1] ?? 'F');
    });
  });

  it('handles the ends of the range', () => {
    expect(scoreToGrade(100)).toBe('A+');
    expect(scoreToGrade(0)).toBe('F');
    expect(scoreToGrade(9.99)).toBe('F');
  });
});
