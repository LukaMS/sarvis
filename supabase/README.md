# supabase

Database migrations for the **dev** Supabase project (`smqovgawfjmxernqlxjd`).

## Rules

- Every schema change is a SQL file in `migrations/`. No changes by hand in the dashboard.
- Apply migrations **only** with the `supabase-dev` MCP (`apply_migration`). Never apply anything to the legacy project (`supabase-legacy` is read-only).
- RLS is enabled on every table. Grant only the privileges a role needs, and expose columns explicitly where clients may update them.
- Security-definer helpers go in the `private` schema, which the Data API doesn't expose. Each one sets `search_path = ''` and has its `EXECUTE` revoked from `public` and `anon`.
- Regenerate the TypeScript types after every schema change (see below).

## Naming

`<version>_<snake_case_name>.sql`. The version is the timestamp that `apply_migration` records, so the file name matches `list_migrations`:

1. Apply with `apply_migration(name: "<snake_case_name>", query: <file contents>)`.
2. Run `list_migrations` and rename the local file to `<version>_<snake_case_name>.sql`.

## Tests

`tests/<domain>.sql` holds the RLS and constraint checks for each catalog domain. Paste the whole file into `execute_sql` on the `supabase-dev` MCP. It runs in one transaction that ends in `rollback`, so it leaves nothing behind. The last `select` lists every check, and each row must have `ok = true`. The scripts create two throwaway `auth.users` rows (an admin and a plain user) inside the transaction, and switch role with `set local role` and `request.jwt.claims`.

## The `+review` columns

Every reviewable fact table (DATA_MODEL §1.5) copies this block exactly. Replace `<table>` with the table name. It's decided if and only if it isn't `pending`. `decision_method` is `admin`, `auto` (passed a rule written in PLAN or DECISIONS) or `legacy` (a bulk decision on legacy-imported facts). Legacy imports arrive `pending` with no decision.

```sql
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  constraint <table>_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  ),
```

Alongside it:

```sql
create index <table>_reviewed_by_idx on public.<table> (reviewed_by);

-- Public tables: everyone reads approved rows, admins read everything.
-- Two policies, because anon can't execute private.is_admin().
create policy <table>_select_anon on public.<table> for select to anon
  using (review_status = 'approved');
create policy <table>_select_authenticated on public.<table> for select to authenticated
  using (review_status = 'approved' or (select private.is_admin()));
```

When the decision comes from the review queue, also set the `review_queue` row to `done` (or `dismissed`) with `resolved_at`.

## The `+prov` columns

Every fact table (DATA_MODEL §1.2) copies this block exactly, followed by `created_at` / `updated_at` and a `private.set_updated_at()` trigger. `source_url` may be null only when `sources.url_template` plus the row's `external_id` rebuilds it. AI-produced facts also get `ai_call_id bigint references public.ai_calls (id) on delete set null` (P2.7 onward), and an `ai` row on a table with `confidence` must set it (`<table>_ai_confidence` check).

```sql
  source_id uuid not null references public.sources (id) on delete restrict,
  source_url text check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  method text not null check (method in ('import', 'api', 'ai', 'manual', 'legacy-import', 'receipt', 'derived')),
  method_version text not null check (char_length(method_version) between 1 and 200),
  ingestion_run_id uuid references public.ingestion_runs (id) on delete set null,
  raw_object_id uuid references public.raw_objects (id) on delete set null,
```

Alongside it, one index per foreign key (the performance advisor flags unindexed ones):

```sql
create index <table>_source_idx on public.<table> (source_id);
create index <table>_ingestion_run_idx on public.<table> (ingestion_run_id);
create index <table>_raw_object_idx on public.<table> (raw_object_id);
```

Public tables with write access use one policy per command (`insert`, `update`, `delete`) for the admin check, never `for all`, so each role keeps a single permissive `select` policy.

## Types

Run `generate_typescript_types` on the `supabase-dev` MCP and save the output verbatim to `packages/core/src/db/database.types.ts`. `npm run db:types` prints this reminder. A CLI-based generator would need a personal access token, which isn't set up.

## Migrations

| Version | Name | What |
|---|---|---|
| 20261027180523 | profiles_and_roles | `profiles`, `private.is_admin()`, `private.handle_new_user()` trigger, `updated_at` trigger, RLS (P1.5) |
| 20261027205021 | delete_own_account | `private.delete_own_account()` (security definer) + `public.delete_own_account()` invoker wrapper for `rpc()` (P1.11) |
| 20261028174807 | admin_ping | `public.admin_ping()`: `true` for admins, raises `42501` otherwise. The web `/admin` gate (P1.12) |
| 20261028200133 | catalog_pipeline_bookkeeping | `pg_trgm`, `unaccent`, `normalize_match_text()`, the `slug` domain; `sources` (public read), `ingestion_runs`, `ingestion_run_events`, `raw_objects`, `validation_failures` (admin); `source_attributions` view; private `raw` bucket with admin read (P2.1) |
| 20261028221731 | seed_sources | Data: `sources` rows for S1–S30 (avoided ones disabled; S24 as one disabled umbrella row) plus internal `manual`, `legacy-import`, `receipts`, `derived`, `fixture`. Re-runnable upsert on `key` that changes 0 rows on a second run (P2.2, D-032) |
| 20261028223450 | catalog_matching_review | `match_candidates` (unique on kind, subject, candidate, method version; kind pins the subject and candidate tables) and `review_queue` (one open row per item), both admin only (P2.3, D-033) |
| 20261028225008 | catalog_ownership | `companies`, `brands` (trigram name indexes, merge columns), `company_ownership` (cycle-rejecting trigger, one current approved controlling parent per company), `brand_ownership` (one current approved owner per brand), `banners`; `+prov` block; views `brand_current_owner` and `company_ultimate_parent`. Public read, admin write (P2.4, D-034) |
| 20261028230610 | catalog_products | GTIN helpers `gtin_is_valid()`, `gtin_normalize()`, `gtin_is_restricted()`; `categories` (path slugs, parent-path trigger), `category_mappings` (`+review`), `labels` (10 fixed rows), `products` (GTIN-14 check, `(source_id, external_id)` key, trigram name index), `product_identifiers` (unique nulls not distinct on scheme, value, banner), `product_sources` (admin only); views `products_with_source_url` and `product_ownership_chain`. Public read, admin write (P2.5, D-035) |
| 20261028232852 | catalog_stores_prices | `stores` (OSM and banner keys), `store_listings` (generated `listing_key`, partial SKU / name keys, unmatched rows admin only), `price_observations` (price > 0 and ≤ 10,000), `price_points_weekly` (public where `n_receipts ≥ 2`), `price_points_monthly`, `reference_prices`, `price_sanity_bounds` (admin only); views `current_prices` (effective-price rule) and `price_observations_with_source_url` (P2.6, D-036) |
