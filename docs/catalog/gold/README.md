# Gold sets

Hand-labelled data for measuring the catalog and the matchers. The repo is public, so nothing here may identify the owner or anyone else.

| File | What it holds | Task |
|---|---|---|
| `receipt_lines.csv` | 18 item lines from 2 of the owner's receipts, with a coverage label and the catalog product when there is one | P4.24 (coverage), P4.20 (true products) |
| `coverage_probe.md` | the P4.24 method, results and misses | P4.24 |

## `receipt_lines.csv`

- **Columns:** `line_id` (receipt + line number, not tied to any date or store location), `banner`, `line_text`, `coverage` (`in_catalog`, `missing`, `no_barcode`, `unidentified`, `out_of_scope`; see `coverage_probe.md`), `catalog_match` (the product's name in the catalog, for `in_catalog`), `note`.
- **Source:** the owner's own receipts, read from the legacy app's `receipt_items` with the owner's OK (D-082). The line text is the legacy app's reading of the printed line.
- **Privacy rules (P4.20):** only the line text, the banner and the labels. No store location, date, totals, prices, card or loyalty digits, names or images. Each line is checked by hand, and a scan for digit runs of 6 or more and for the owner's name and email must find nothing before a commit.
- **Adding lines:** append with the next `line_id`, run the scan, and say in PROGRESS where the lines came from.
