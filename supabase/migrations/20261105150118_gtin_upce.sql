-- P4.1 GTIN: UPC-E expansion and restricted EAN-8 (DATA_MODEL §1.4, D-078).
-- gtin_is_valid is unchanged. The TS twins in packages/core/src/gtin.ts pass the same vectors
-- (gtin.vectors.json; `npm run check:gtin` runs them here).

-- The UPC-A a zero-suppressed UPC-E code stands for, or null when value isn't a valid UPC-E.
-- Number system 0 only: OFF's would-be number system 1 codes are EAN-8 (D-078).
create function public.gtin_upce_to_upca(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select case when value ~ '^0[0-9]{7}$' then (
    select case when public.gtin_is_valid(upca) then upca end
    from (
      select '0' || (
        case
          when d6 <= '2' then substr(value, 2, 2) || d6 || '0000' || substr(value, 4, 3)
          when d6 = '3' then substr(value, 2, 3) || '00000' || substr(value, 5, 2)
          when d6 = '4' then substr(value, 2, 4) || '00000' || substr(value, 6, 1)
          else substr(value, 2, 5) || '0000' || d6
        end
      ) || substr(value, 8, 1) as upca
      from (select substr(value, 7, 1) as d6) as last_digit
    ) as expanded
  ) end;
$$;

comment on function public.gtin_upce_to_upca(text) is
  'UPC-A for an 8-digit number-system-0 UPC-E with a valid check digit, else null (DATA_MODEL §1.4).';

-- The GTIN-14 form. An 8-digit code that is valid UPC-E is read as UPC-E first, even when it's also a
-- valid EAN-8. Otherwise UPC-A gets 00, EAN-13 gets 0, EAN-8 gets six 0s; null when not a valid code.
create or replace function public.gtin_normalize(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select coalesce(
    lpad(public.gtin_upce_to_upca(value), 14, '0'),
    case when public.gtin_is_valid(value) then lpad(value, 14, '0') end
  );
$$;

comment on function public.gtin_normalize(text) is
  'GTIN-14 for a valid code, reading a valid 8-digit UPC-E as its UPC-A; else null (DATA_MODEL §1.4).';

-- Adds EAN-8 prefixes 0 and 2 (RCN-8: six 0s, then 0 or 2, in GTIN-14 form). Existing products rows
-- in those forms fail the products check on any update until P4.3 rewrites them.
create or replace function public.gtin_is_restricted(value text)
returns boolean
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select coalesce(public.gtin_normalize(value) ~ '^(0(02|2)|000000[02])', false);
$$;

comment on function public.gtin_is_restricted(text) is
  'True for a valid code with GS1 prefix 02 or 20-29, or an EAN-8 with prefix 0 or 2 (in GTIN-14 form: 002…, 02…, 0000000…, 0000002…). DATA_MODEL §1.4.';
