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

## Types

Run `generate_typescript_types` on the `supabase-dev` MCP and save the output verbatim to `packages/core/src/db/database.types.ts`. `npm run db:types` prints this reminder. A CLI-based generator would need a personal access token, which isn't set up.

## Migrations

| Version | Name | What |
|---|---|---|
| 20261027180523 | profiles_and_roles | `profiles`, `private.is_admin()`, `private.handle_new_user()` trigger, `updated_at` trigger, RLS (P1.5) |
| 20261027205021 | delete_own_account | `private.delete_own_account()` (security definer) + `public.delete_own_account()` invoker wrapper for `rpc()` (P1.11) |
| 20261028174807 | admin_ping | `public.admin_ping()`: `true` for admins, raises `42501` otherwise. The web `/admin` gate (P1.12) |
