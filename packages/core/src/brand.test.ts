import { describe, expect, it } from 'vitest';

import {
  BRAND_STOPLIST,
  brandKey,
  brandKeyRaw,
  brandKeys,
  clusterBrands,
  isNonBrand,
  pickBrandPart,
  splitBrandText,
} from './brand.ts';
import top500 from './brand.top500.json';

describe('brandKey', () => {
  it.each([
    // Apostrophes, straight or curly, are removed without a break.
    ["President's Choice", 'presidentschoice'],
    ['President’s Choice', 'presidentschoice'],
    ['Presidents Choice', 'presidentschoice'],
    ['Longo`s', 'longos'],
    // Accents and case.
    ['Irrésistibles', 'irresistibles'],
    ['IRRESISTIBLES', 'irresistibles'],
    ['Nestlé', 'nestle'],
    ['Le Choix du Président', 'lechoixdupresident'],
    ['Iögo', 'iogo'],
    // & is "and".
    ['T&T', 'tandt'],
    ['T & T', 'tandt'],
    ['T And T', 'tandt'],
    ["Ben & Jerry's", 'benandjerrys'],
    // Trademark signs, including ™, which NFKD would turn into "TM".
    ['Kraft™', 'kraft'],
    ['Heinz®', 'heinz'],
    ['Oreo ©', 'oreo'],
    // Spaces, hyphens and dots are dropped.
    ['Farm Boy', 'farmboy'],
    ['Farmboy', 'farmboy'],
    ['Co-op Gold', 'coopgold'],
    ['Dr. Oetker', 'droetker'],
    ['7-Eleven', '7eleven'],
    ['Western Family 🇨🇦', 'westernfamily'],
    // Legal suffixes, one or several words, and a leading "the".
    ['ACE Bakery Limited', 'acebakery'],
    ['Nestlé S.A.', 'nestle'],
    ['Elite Sweets Brands Inc.', 'elitesweetsbrands'],
    ['Saputo Ltée', 'saputo'],
    ['Smith & Co.', 'smith'],
    ['The Laughing Cow', 'laughingcow'],
    // …but never the whole name, and not "Company" or "Brand".
    ['Inc', 'inc'],
    ['Co-op', 'coop'],
    ['The', 'the'],
    ['Kettle Brand', 'kettlebrand'],
    ['The Honest Company', 'honestcompany'],
  ])('%s → %s', (text, key) => {
    expect(brandKey(text)).toBe(key);
  });

  it('keeps different brands apart', () => {
    expect(brandKey('M&M')).not.toBe(brandKey("M&M's"));
    expect(brandKey('Kirkland')).not.toBe(brandKey('Kirkland Signature'));
    expect(brandKey('Lindt')).not.toBe(brandKey('Lindt & Sprüngli'));
    expect(brandKey('Irresistible')).not.toBe(brandKey('Irresistibles'));
  });

  it('leaves translated names to aliases (P4.12)', () => {
    expect(brandKey('No Name')).not.toBe(brandKey('Sans nom'));
    expect(brandKey("President's Choice")).not.toBe(brandKey('Le Choix du Président'));
  });

  it('is null for empty strings and punctuation', () => {
    for (const s of ['', '   ', '?', '...', '-', '™']) expect(brandKey(s)).toBeNull();
  });
});

describe('BRAND_STOPLIST', () => {
  const cases: [string, string][] = [
    ['null', 'null'],
    ['none', 'None'],
    ['na', 'N/A'],
    ['unknown', 'Unknown'],
    ['inconnu', 'Inconnu'],
    ['inconnue', 'Inconnue'],
    ['generic', 'Generic'],
    ['generique', 'Générique'],
    ['homemade', 'Homemade'],
    ['faitmaison', 'Fait maison'],
    ['produitmaison', 'Produit maison'],
    ['maison', 'Maison'],
    ['nobrand', 'no brand'],
    ['sansmarque', 'Sans marque'],
    ['aucunemarque', 'Aucune marque'],
    ['brand', 'Brand'],
    ['marque', 'Marque'],
    ['xxxx', 'XXXX'],
  ];

  it('has a case for every entry', () => {
    expect(cases.map(([k]) => k).sort()).toEqual([...BRAND_STOPLIST].sort());
  });

  it.each(cases)('%s: "%s" names no brand', (key, text) => {
    expect(brandKeyRaw(text)).toBe(key);
    expect(brandKey(text)).toBeNull();
    expect(isNonBrand(text)).toBe(true);
  });

  it('leaves real brands that contain those words', () => {
    for (const s of ['Maison Orphée', 'Life Brand', 'Kettle Brand', 'No Name', 'Marque Repère']) {
      expect(isNonBrand(s)).toBe(false);
    }
  });
});

describe('splitBrandText and brandKeys', () => {
  it('splits OFF comma lists', () => {
    expect(splitBrandText('G,Gatorade, Pepsico ')).toEqual(['G', 'Gatorade', 'Pepsico']);
    expect(splitBrandText(' , ,')).toEqual([]);
    expect(splitBrandText(null)).toEqual([]);
  });

  it('keeps distinct keys in order, without non-brands', () => {
    expect(brandKeys('Hershey,Hershey’s, Hershey')).toEqual(['hershey', 'hersheys']);
    expect(brandKeys('Unknown, Farm Boy, Farmboy')).toEqual(['farmboy']);
    expect(brandKeys('null')).toEqual([]);
  });
});

describe('clusterBrands', () => {
  it('groups spellings and names the cluster after the most common one', () => {
    const c = clusterBrands([
      { brand: 'Presidents Choice', products: 160 },
      { brand: "President's Choice", products: 1839 },
      { brand: 'President’s Choice', products: 110 },
      { brand: 'Unknown', products: 22 },
      { brand: 'Kraft', products: 284 },
    ]);
    expect(c).toEqual([
      {
        key: 'presidentschoice',
        name: "President's Choice",
        products: 2109,
        variants: [
          { brand: "President's Choice", products: 1949 },
          { brand: 'Presidents Choice', products: 160 },
        ],
      },
      { key: 'kraft', name: 'Kraft', products: 284, variants: [{ brand: 'Kraft', products: 284 }] },
    ]);
  });

  it('breaks a tie by code-point order', () => {
    const [c] = clusterBrands([
      { brand: 'Nestle', products: 5 },
      { brand: 'Nestlé', products: 5 },
    ]);
    expect(c?.name).toBe('Nestle');
  });
});

describe('the real top 500 OFF brand strings (brand.top500.json)', () => {
  const rows = top500.rows;
  const clusters = clusterBrands(rows);

  it('gives every string a key except the two non-brands', () => {
    expect(rows).toHaveLength(500);
    expect(rows.filter((r) => brandKey(r.brand) === null).map((r) => r.brand)).toEqual([
      'null',
      'Unknown',
    ]);
  });

  it('makes exactly these merges (each checked by hand, see PROGRESS P4.11)', () => {
    const merged = clusters
      .filter((c) => c.variants.length > 1)
      .map((c) => [c.name, ...c.variants.slice(1).map((v) => v.brand)].join(' = '));
    expect(merged).toEqual([
      "President's Choice = Presidents Choice",
      'Farm Boy = Farmboy',
      'Selection = Sélection',
      'Irrésistibles = Irresistibles',
      "Longos = Longo's",
      'Nestlé = Nestle',
      'Irresistible = Irrésistible',
      "Lay's = Lays",
      'Co-op Gold = Coop Gold',
      'Freshprep = Fresh Prep',
      'Shop Santé = Shop Sante',
      'Co-op = Coop',
      "Campbell's = Campbells",
      'Made Good = MadeGood',
      "Farmer's Market = Farmers Market",
      'Première Moisson = Premiere Moisson',
      'goodprotein = Good Protein',
      'Ace Bakery = ACE Bakery Limited',
      'Bassé = Basse',
    ]);
    expect(clusters).toHaveLength(476);
  });

  it('keeps apart strings that are different brands', () => {
    const keyOf = (s: string) => {
      const r = rows.find((x) => x.brand === s);
      expect(r, s).toBeDefined();
      return brandKey(s);
    };
    for (const [a, b] of [
      ['Kirkland', 'Kirkland Signature'],
      ['M&M', "M&M's"],
      ['Whole Foods', 'Whole Foods Market'],
      ['Lindt', 'Lindt & Sprüngli'],
      ['Clif', 'Clif Bar'],
      ['Monster', 'Monster Energy'],
      ['Hershey', "Hershey's"],
      ['Quaker', 'Quaker Oats'],
      ['Summerhill', 'Summerhill Market'],
    ] as const) {
      expect(keyOf(a)).not.toBe(keyOf(b));
    }
  });
});

describe('pickBrandPart', () => {
  const owned = new Set(['gatorade', 'metro', 'kirklandsignature', 'mott', 'motts']);
  const isOwned = (k: string) => owned.has(k);

  it.each([
    // Real brand_text values from OFF products.
    ['G, Gatorade, Pepsico', 'Gatorade', true],
    ['Gatorlyte,Gatorade', 'Gatorade', true],
    ['Selection, Metro', 'Metro', true],
    ['Costco Companies Inc., Kirkland Signature', 'Kirkland Signature', true],
    ["Mr & Mrs T,Mott's", "Mott's", true],
    // No part has an owner: the first part.
    ['Pizza Pops,Pillsbury,Old El Paso', 'Pizza Pops', false],
    ['Yves, Yves Veggie Cuisine', 'Yves', false],
    // The first part names no brand.
    ['Unknown, Kraft', 'Kraft', false],
    // One part.
    ['Gatorade', 'Gatorade', true],
    ['Kraft', 'Kraft', false],
  ])('%s → %s', (text, part, isOwnedPick) => {
    expect(pickBrandPart(text, isOwned)).toEqual({
      text: part,
      key: brandKey(part),
      owned: isOwnedPick,
    });
  });

  it('takes the first owned part when several have owners', () => {
    expect(pickBrandPart('Metro, Gatorade', isOwned)?.text).toBe('Metro');
  });

  it('is null when no part names a brand', () => {
    expect(pickBrandPart('null, Unknown', isOwned)).toBeNull();
    expect(pickBrandPart('', isOwned)).toBeNull();
    expect(pickBrandPart(null, isOwned)).toBeNull();
  });
});
