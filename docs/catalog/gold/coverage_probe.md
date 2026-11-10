# Coverage probe (P4.24, 2026-11-10)

Is what the owner buys in the catalog? A first look on real purchases, before more is built on that assumption (review C-2, D-082).

## Input

- **Two of the owner's own Fortinos receipts, 18 item lines** (`receipt_lines.csv`). They come from the legacy app's `receipt_scans` / `receipt_items`, read-only, with the owner's OK. The legacy table holds 80 lines, but they are these two receipts scanned several times, plus 2026-08-06 test scans ("Zzzz Fake Product 999", $0), which are left out.
- The line text is the legacy app's reading of the printed line, so it may differ slightly from the paper. `MRJ` / `HMRJ` are Fortinos tax and department flags, kept as read.
- **No barcodes.** The owner doesn't have ~50 products at home, so the barcode half of the probe didn't run (D-082).
- **This is a small sample.** One line is 5.6% of the total, so read the shares as a direction, not a measurement.

## Method

Each line was decoded by hand ("CLSO BOLOGNESE CA" = Classico Bolognese) and searched for in the dev catalog (active products, name + brand string, `ILIKE`), on 2026-11-10 after the P4.3 re-import (93,382 OFF products). The labels are:

| Label | Meaning |
|---|---|
| `in_catalog` | a barcoded product, and the catalog has it (the same item, or the same product line when the line doesn't give the flavour) |
| `missing` | a barcoded product the catalog doesn't have |
| `no_barcode` | produce, in-store bakery, deli counter: nothing to look up by GTIN |
| `unidentified` | can't tell from the line what was bought |
| `out_of_scope` | non-food (the catalog covers food only, D-082) |

## Results

| Label | Lines | Share of 18 | Share of the 13 identified food lines |
|---|---|---|---|
| `in_catalog` | 5 | 28% | 38% |
| `missing` | 3 | 17% | 23% |
| `no_barcode` | 5 | 28% | 38% |
| `unidentified` | 3 | 17% | — |
| `out_of_scope` | 2 | 11% | — |

- **Barcoded food lines found: 5 of 8 (63%).** Before the owner put non-food out of scope, the count was 5 of 10 (50%).
- **The plan's 60% line:** the first count (50%) was under it, so the on-scan OFF API lookup was added as a task (P4B.6). Food only, 63% is just over it, but on 8 lines one item moves the rate by 12 points, so P4B.6 stays (D-082). The data can't show how many of the misses OFF has outside the Canadian set.
- **Brand and owner:** of the 5 found, 1 has a `brand_id` (Unico, from the legacy import, with a pending owner link that isn't shown to users). The other 4 have only a brand string. That's expected before brand linking (P4.11 to P4.16).

Products found (GTIN): Classico Bolognese sauce `00057000012496`; siggi's skyr Raspberry `00068200325033`; Unico Scoobi Doo Pasta `00067800005093`; Nature Valley Granola Protein Oats 'N' Honey `00065633461222`; President's Choice Organic Arugula `00060383991548`.

## Misses (all of them; there are fewer than 10)

| Line | What it is | What the catalog has instead |
|---|---|---|
| `STBU ALM OAT HZL RQ` | Starbucks Almond & Oat creamer, hazelnut | plain and pumpkin spice of the same line |
| `NN BASIL LEAVES` | No Name basil leaves | Club House, Compliments and Encore basil leaves |
| `UNICO PASSATA CU` | Unico passata | 77 other Unico products, and other brands' passata |
| `NATV BW CTRS HRB` | Native body wash, citrus & herbal (out of scope) | 2 Native hair products |
| `DOVE MC DS FRESH` | Dove Men+Care deodorant stick, Fresh (out of scope) | other Dove Men+Care items |
| `DMC APA STAIND FN` | unidentified | — |
| `PROTEIN DRINK` | unidentified (no brand on the line) | — |
| `G.G. FRUIT JUICE` | unidentified | — |

## What it suggests

1. **Every barcoded miss is a sibling of something the catalog has:** the same brand, often the same product line. The brand-level answer (who owns it, how it rates) would still reach these lines once brands are linked, even when the exact item is missing. That holds for all 8 barcoded food lines.
2. **A third of a basket has no barcode.** Produce, bakery and deli need the generic items (P4.28) to be matched at all.
3. **Non-food is on grocery receipts** (2 of 5 misses: body wash, deodorant). The owner decided the catalog covers food only for now (D-082), so these lines are `out_of_scope`.
4. **Receipt abbreviations are hard:** 3 of 18 lines (17%) couldn't be decoded by a person. The legacy app's own cleaned-up reading of the same receipt also misread some ("Cupping Agents" for `UNICO PASSATA CU`), so receipt matches will need user confirmation (P4.21, Phase 8).
5. **The private label share is real:** 2 of 13 lines on the first receipt are Loblaw's own brands (No Name, PC). P4.12 already covers them.
