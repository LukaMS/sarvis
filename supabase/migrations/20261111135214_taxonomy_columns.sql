-- P4.8 (D-090): two columns the taxonomy needs.
--   categories.sold_loose: the leaf holds items sold without a barcode (produce, meat, seafood,
--     bakery, deli, bulk). P4.28 seeds generic items from these leaves.
--   products.category_rule: which rule set `category_id`, as one compact code instead of a
--     match_candidates row per product (D-077). Codes are listed in TAXONOMY.md §4:
--     1 = OFF tags (P4.9), 10-49 = name rules (P4.17), 50-59 = AI (Phase 7), 90 = manual.
alter table public.categories
  add column sold_loose boolean not null default false;

comment on column public.categories.sold_loose is
  'A leaf holding items sold without a barcode (produce, meat, seafood, bakery, deli, bulk); P4.28 seeds generic items from these.';

alter table public.products
  add column category_rule smallint
    constraint products_category_rule_range check (category_rule between 1 and 99),
  add constraint products_category_rule_needs_category
    check (category_rule is null or category_id is not null);

comment on column public.products.category_rule is
  'Which rule set category_id (TAXONOMY.md §4): 1 = OFF tags, 10-49 = name rules, 50-59 = AI, 90 = manual. Null when no category.';
