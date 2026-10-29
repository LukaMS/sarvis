-- P2.22 Hide unreviewed companies, brands and products from users (D-050, D-052).
-- Adds the DATA_MODEL §1.5 +review block to companies, brands and products. Existing rows become
-- `pending`. Public reads now need review_status = 'approved' as well as the status filter; admins
-- still see every row. Imports never set review_status, so new rows arrive `pending`.

alter table public.companies
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  add constraint companies_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  );

alter table public.brands
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  add constraint brands_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  );

alter table public.products
  add column review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'superseded')),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column decision_method text check (decision_method in ('admin', 'auto', 'legacy')),
  add constraint products_review_decided check (
    (review_status = 'pending') = (reviewed_at is null)
    and (review_status = 'pending') = (decision_method is null)
    and (review_status <> 'pending' or reviewed_by is null)
    and (decision_method is distinct from 'auto' or reviewed_by is null)
  );

comment on column public.companies.review_status is
  'Users see the company only when approved (D-050). Imports never change it.';
comment on column public.brands.review_status is
  'Users see the brand only when approved (D-050). Imports never change it.';
comment on column public.products.review_status is
  'Users see the product only when approved (D-050). OFF products that pass validation are auto-approved; legacy and AI ones never are.';

create index companies_reviewed_by_idx on public.companies (reviewed_by);
create index brands_reviewed_by_idx on public.brands (reviewed_by);
create index products_reviewed_by_idx on public.products (reviewed_by);

-- Reads: approved and not rejected (companies, brands) or active (products); admins see everything.
drop policy companies_select_anon on public.companies;
drop policy companies_select_authenticated on public.companies;
drop policy brands_select_anon on public.brands;
drop policy brands_select_authenticated on public.brands;
drop policy products_select_anon on public.products;
drop policy products_select_authenticated on public.products;

create policy companies_select_anon on public.companies for select to anon
  using (review_status = 'approved' and status <> 'rejected');
create policy companies_select_authenticated on public.companies for select to authenticated
  using ((review_status = 'approved' and status <> 'rejected') or (select private.is_admin()));

create policy brands_select_anon on public.brands for select to anon
  using (review_status = 'approved' and status <> 'rejected');
create policy brands_select_authenticated on public.brands for select to authenticated
  using ((review_status = 'approved' and status <> 'rejected') or (select private.is_admin()));

create policy products_select_anon on public.products for select to anon
  using (review_status = 'approved' and status = 'active');
create policy products_select_authenticated on public.products for select to authenticated
  using ((review_status = 'approved' and status = 'active') or (select private.is_admin()));
