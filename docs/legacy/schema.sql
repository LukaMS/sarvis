-- =============================================================================
-- Legacy schema dump: Ethical-App ("Conscious Curator"), Supabase project
-- chaidwvlizbayyugnphw, schema `public` (plus the auth trigger that feeds it).
--
-- Generated 2026-10-26 (task P0.1) from read-only pg_catalog queries via the
-- supabase-legacy MCP (read_only=true). Reference only: this file is NOT a
-- migration for the rebuild and is not meant to be applied anywhere.
--
-- Contents (live counts at dump time):
--   1 extension in public (pg_trgm, which owns 31 public functions)
--   28 tables, 2 views, 16 user-defined functions (47 total incl. pg_trgm)
--   41 PK/UNIQUE/CHECK constraints (28/3/10), 38 foreign keys, 49 standalone indexes
--   (80 indexes in pg_indexes, 31 of which back PK/UNIQUE constraints)
--   19 triggers on public tables + 1 on auth.users
--   RLS enabled on 28/28 tables, 27 policies
--   0 storage buckets, 0 enums, 0 sequences
--
-- Line endings inside function bodies were normalised to LF.
-- See docs/legacy/SCHEMA.md for the readable summary and drift notes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions (installed; schema shown)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;            -- 1.6
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;       -- 1.3
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;    -- 1.1
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions; -- 1.11
CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;        -- 1.5.11
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;      -- 0.3.1
-- plpgsql 1.0 in pg_catalog (default)

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE public.app_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.boycotts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL,
  reason text,
  status text,
  source_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.brands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text,
  company_id uuid,
  logo_url text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.catalog_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  upc text,
  normalized_name text NOT NULL,
  brand text,
  description text,
  package_quantity numeric,
  package_unit text,
  package_size_text text,
  image_url text,
  product_match_status text DEFAULT 'retailer_specific'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.certifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL,
  verified boolean DEFAULT false NOT NULL,
  verified_date date
);

CREATE TABLE public.community_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  submission_type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  reviewer_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

CREATE TABLE public.companies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  company_name text NOT NULL,
  legal_name text,
  headquarters text,
  founded integer,
  public_or_private text,
  stock_ticker text,
  revenue_range text,
  ceo text,
  description text,
  logo_url text,
  parent_company_id uuid,
  overall_ethical_rating text NOT NULL,
  brands text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.controversies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  title text NOT NULL,
  date_text text,
  description text,
  source_url text,
  severity text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ethical_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  category text NOT NULL,
  rating text NOT NULL,
  notes text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.impact_stories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  subtitle text,
  category text,
  body text,
  cover_image_url text,
  company_id uuid,
  featured boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_aliases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  alias text NOT NULL,
  source text DEFAULT 'manual'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_features (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  icon text,
  title text NOT NULL,
  description text,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  barcode text,
  ethical_score integer,
  grade text,
  image_url text,
  description text,
  certifications text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  brand text,
  brand_id uuid,
  source text DEFAULT 'manual'::text NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text DEFAULT ''::text NOT NULL,
  avatar_url text,
  bio text DEFAULT ''::text NOT NULL,
  member_since timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.receipt_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receipt_scan_id uuid NOT NULL,
  scan_history_id uuid,
  product_id uuid,
  product_name text,
  price numeric(10,2),
  grade text,
  notes text
);

CREATE TABLE public.receipt_scans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  scan_history_id uuid,
  store_name text,
  trip_rating text,
  total_items integer,
  total_amount numeric(10,2),
  scanned_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.retailer_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  retailer_id uuid NOT NULL,
  external_category_id text NOT NULL,
  parent_category_id uuid,
  name text NOT NULL,
  slug text,
  level integer DEFAULT 0 NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_product_count integer,
  last_successful_sync_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  url_path text,
  navid text
);

CREATE TABLE public.retailer_product_categories (
  retailer_product_id uuid NOT NULL,
  retailer_category_id uuid NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.retailer_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  retailer_id uuid NOT NULL,
  catalog_product_id uuid,
  external_product_id text NOT NULL,
  external_article_number text,
  retailer_name text NOT NULL,
  retailer_brand text,
  retailer_description text,
  product_url text,
  image_url text,
  raw_fingerprint text,
  first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  last_metadata_change_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_sponsored boolean DEFAULT false NOT NULL
);

CREATE TABLE public.retailer_request_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  retailer_id uuid NOT NULL,
  store_id uuid,
  provider_key text NOT NULL,
  name text NOT NULL,
  request_template_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  sanitized_headers_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  last_validated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.retailer_stores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  retailer_id uuid NOT NULL,
  external_store_id text NOT NULL,
  name text NOT NULL,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  timezone text,
  is_enabled boolean DEFAULT true NOT NULL,
  metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_successful_sync_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.retailers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider_key text NOT NULL,
  name text NOT NULL,
  slug text,
  country_code text DEFAULT 'CA'::text NOT NULL,
  default_currency text DEFAULT 'CAD'::text NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  configuration_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.scan_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid,
  company_id uuid,
  scan_type text NOT NULL,
  product_name text,
  ethical_score integer,
  grade text,
  label text,
  scanned_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.scrape_job_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scrape_job_id uuid NOT NULL,
  severity text DEFAULT 'info'::text NOT NULL,
  event_type text NOT NULL,
  message text,
  category_external_id text,
  page integer,
  external_product_id text,
  details_json jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.scrape_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  retailer_id uuid NOT NULL,
  store_id uuid,
  provider_key text NOT NULL,
  job_type text DEFAULT 'full_sync'::text NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  requested_by text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  claimed_by text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancel_requested_at timestamp with time zone,
  heartbeat_at timestamp with time zone,
  progress_current integer DEFAULT 0 NOT NULL,
  progress_total integer DEFAULT 0 NOT NULL,
  current_category_id text,
  current_page integer,
  products_fetched integer DEFAULT 0 NOT NULL,
  products_created integer DEFAULT 0 NOT NULL,
  products_updated integer DEFAULT 0 NOT NULL,
  products_unchanged integer DEFAULT 0 NOT NULL,
  products_failed integer DEFAULT 0 NOT NULL,
  retry_count integer DEFAULT 0 NOT NULL,
  configuration_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  error_summary text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.store_product_price_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_product_id uuid NOT NULL,
  regular_price numeric,
  sale_price numeric,
  member_price numeric,
  effective_price numeric,
  promotion_text text,
  observed_at timestamp with time zone DEFAULT now() NOT NULL,
  scrape_job_id uuid
);

CREATE TABLE public.store_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id uuid NOT NULL,
  retailer_product_id uuid NOT NULL,
  regular_price numeric,
  sale_price numeric,
  member_price numeric,
  effective_price numeric,
  currency text DEFAULT 'CAD'::text NOT NULL,
  unit_price numeric,
  unit_price_quantity numeric,
  unit_price_unit text,
  is_listed boolean DEFAULT true NOT NULL,
  is_available_online boolean,
  inventory_status text,
  promotion_text text,
  promotion_start_at timestamp with time zone,
  promotion_end_at timestamp with time zone,
  source_checked_at timestamp with time zone DEFAULT now() NOT NULL,
  last_changed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.transparency_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  step_number integer NOT NULL,
  title text NOT NULL,
  description text
);

-- -----------------------------------------------------------------------------
-- Primary key, unique and check constraints
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.boycotts ADD CONSTRAINT boycotts_pkey PRIMARY KEY (id);
ALTER TABLE public.brands ADD CONSTRAINT brands_pkey PRIMARY KEY (id);
ALTER TABLE public.catalog_products ADD CONSTRAINT catalog_products_pkey PRIMARY KEY (id);
ALTER TABLE public.certifications ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);
ALTER TABLE public.community_submissions ADD CONSTRAINT community_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.community_submissions ADD CONSTRAINT community_submissions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.community_submissions ADD CONSTRAINT community_submissions_submission_type_check CHECK ((submission_type = ANY (ARRAY['company'::text, 'product'::text])));
ALTER TABLE public.companies ADD CONSTRAINT companies_overall_ethical_rating_check CHECK ((overall_ethical_rating = ANY (ARRAY['Good'::text, 'Mixed'::text, 'Poor'::text])));
ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_public_or_private_check CHECK ((public_or_private = ANY (ARRAY['Public'::text, 'Private'::text])));
ALTER TABLE public.companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);
ALTER TABLE public.controversies ADD CONSTRAINT controversies_pkey PRIMARY KEY (id);
ALTER TABLE public.controversies ADD CONSTRAINT controversies_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.ethical_scores ADD CONSTRAINT ethical_scores_category_check CHECK ((category = ANY (ARRAY['environment'::text, 'labour'::text, 'animal_welfare'::text, 'politics_and_tax'::text, 'human_rights'::text])));
ALTER TABLE public.ethical_scores ADD CONSTRAINT ethical_scores_company_id_category_key UNIQUE (company_id, category);
ALTER TABLE public.ethical_scores ADD CONSTRAINT ethical_scores_pkey PRIMARY KEY (id);
ALTER TABLE public.ethical_scores ADD CONSTRAINT ethical_scores_rating_check CHECK ((rating = ANY (ARRAY['Good'::text, 'Mixed'::text, 'Poor'::text])));
ALTER TABLE public.impact_stories ADD CONSTRAINT impact_stories_pkey PRIMARY KEY (id);
ALTER TABLE public.product_aliases ADD CONSTRAINT product_aliases_pkey PRIMARY KEY (id);
ALTER TABLE public.product_features ADD CONSTRAINT product_features_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE (barcode);
ALTER TABLE public.products ADD CONSTRAINT products_ethical_score_check CHECK (((ethical_score >= 0) AND (ethical_score <= 100)));
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.receipt_items ADD CONSTRAINT receipt_items_pkey PRIMARY KEY (id);
ALTER TABLE public.receipt_scans ADD CONSTRAINT receipt_scans_pkey PRIMARY KEY (id);
ALTER TABLE public.retailer_categories ADD CONSTRAINT retailer_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.retailer_product_categories ADD CONSTRAINT retailer_product_categories_pkey PRIMARY KEY (retailer_product_id, retailer_category_id);
ALTER TABLE public.retailer_products ADD CONSTRAINT retailer_products_pkey PRIMARY KEY (id);
ALTER TABLE public.retailer_request_profiles ADD CONSTRAINT retailer_request_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.retailer_stores ADD CONSTRAINT retailer_stores_pkey PRIMARY KEY (id);
ALTER TABLE public.retailers ADD CONSTRAINT retailers_pkey PRIMARY KEY (id);
ALTER TABLE public.scan_history ADD CONSTRAINT scan_history_pkey PRIMARY KEY (id);
ALTER TABLE public.scan_history ADD CONSTRAINT scan_history_scan_type_check CHECK ((scan_type = ANY (ARRAY['barcode'::text, 'qr'::text, 'manual_search'::text, 'receipt'::text])));
ALTER TABLE public.scrape_job_events ADD CONSTRAINT scrape_job_events_pkey PRIMARY KEY (id);
ALTER TABLE public.scrape_jobs ADD CONSTRAINT scrape_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.scrape_jobs ADD CONSTRAINT scrape_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'claiming'::text, 'running'::text, 'cancelling'::text, 'cancelled'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text])));
ALTER TABLE public.store_product_price_history ADD CONSTRAINT store_product_price_history_pkey PRIMARY KEY (id);
ALTER TABLE public.store_products ADD CONSTRAINT store_products_pkey PRIMARY KEY (id);
ALTER TABLE public.transparency_steps ADD CONSTRAINT transparency_steps_pkey PRIMARY KEY (id);

-- -----------------------------------------------------------------------------
-- Foreign keys
-- -----------------------------------------------------------------------------
ALTER TABLE public.boycotts ADD CONSTRAINT boycotts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.brands ADD CONSTRAINT brands_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE public.certifications ADD CONSTRAINT certifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.community_submissions ADD CONSTRAINT community_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.community_submissions ADD CONSTRAINT community_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.companies ADD CONSTRAINT companies_parent_company_id_fkey FOREIGN KEY (parent_company_id) REFERENCES companies(id);
ALTER TABLE public.controversies ADD CONSTRAINT controversies_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.ethical_scores ADD CONSTRAINT ethical_scores_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.impact_stories ADD CONSTRAINT impact_stories_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE public.product_aliases ADD CONSTRAINT product_aliases_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.product_features ADD CONSTRAINT product_features_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.receipt_items ADD CONSTRAINT receipt_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.receipt_items ADD CONSTRAINT receipt_items_receipt_scan_id_fkey FOREIGN KEY (receipt_scan_id) REFERENCES receipt_scans(id) ON DELETE CASCADE;
ALTER TABLE public.receipt_items ADD CONSTRAINT receipt_items_scan_history_id_fkey FOREIGN KEY (scan_history_id) REFERENCES scan_history(id);
ALTER TABLE public.receipt_scans ADD CONSTRAINT receipt_scans_scan_history_id_fkey FOREIGN KEY (scan_history_id) REFERENCES scan_history(id);
ALTER TABLE public.receipt_scans ADD CONSTRAINT receipt_scans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.retailer_categories ADD CONSTRAINT retailer_categories_parent_category_id_fkey FOREIGN KEY (parent_category_id) REFERENCES retailer_categories(id) ON DELETE SET NULL;
ALTER TABLE public.retailer_categories ADD CONSTRAINT retailer_categories_retailer_id_fkey FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE public.retailer_product_categories ADD CONSTRAINT retailer_product_categories_retailer_category_id_fkey FOREIGN KEY (retailer_category_id) REFERENCES retailer_categories(id) ON DELETE CASCADE;
ALTER TABLE public.retailer_product_categories ADD CONSTRAINT retailer_product_categories_retailer_product_id_fkey FOREIGN KEY (retailer_product_id) REFERENCES retailer_products(id) ON DELETE CASCADE;
ALTER TABLE public.retailer_products ADD CONSTRAINT retailer_products_catalog_product_id_fkey FOREIGN KEY (catalog_product_id) REFERENCES catalog_products(id) ON DELETE SET NULL;
ALTER TABLE public.retailer_products ADD CONSTRAINT retailer_products_retailer_id_fkey FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE public.retailer_request_profiles ADD CONSTRAINT retailer_request_profiles_retailer_id_fkey FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE public.retailer_request_profiles ADD CONSTRAINT retailer_request_profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES retailer_stores(id) ON DELETE SET NULL;
ALTER TABLE public.retailer_stores ADD CONSTRAINT retailer_stores_retailer_id_fkey FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE public.scan_history ADD CONSTRAINT scan_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE public.scan_history ADD CONSTRAINT scan_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE public.scan_history ADD CONSTRAINT scan_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.scrape_job_events ADD CONSTRAINT scrape_job_events_scrape_job_id_fkey FOREIGN KEY (scrape_job_id) REFERENCES scrape_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.scrape_jobs ADD CONSTRAINT scrape_jobs_retailer_id_fkey FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE public.scrape_jobs ADD CONSTRAINT scrape_jobs_store_id_fkey FOREIGN KEY (store_id) REFERENCES retailer_stores(id) ON DELETE SET NULL;
ALTER TABLE public.store_product_price_history ADD CONSTRAINT store_product_price_history_store_product_id_fkey FOREIGN KEY (store_product_id) REFERENCES store_products(id) ON DELETE CASCADE;
ALTER TABLE public.store_products ADD CONSTRAINT store_products_retailer_product_id_fkey FOREIGN KEY (retailer_product_id) REFERENCES retailer_products(id) ON DELETE CASCADE;
ALTER TABLE public.store_products ADD CONSTRAINT store_products_store_id_fkey FOREIGN KEY (store_id) REFERENCES retailer_stores(id) ON DELETE CASCADE;
ALTER TABLE public.transparency_steps ADD CONSTRAINT transparency_steps_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
-- Note: store_product_price_history.scrape_job_id has no FK constraint.

-- -----------------------------------------------------------------------------
-- Indexes (excluding those backing PK/UNIQUE constraints)
-- -----------------------------------------------------------------------------
CREATE INDEX idx_boycotts_company_id ON public.boycotts USING btree (company_id);
CREATE INDEX brands_company_idx ON public.brands USING btree (company_id);
CREATE INDEX brands_name_trgm_idx ON public.brands USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX brands_name_unique_idx ON public.brands USING btree (lower(name));
CREATE INDEX catalog_products_brand_idx ON public.catalog_products USING btree (lower(brand));
CREATE INDEX catalog_products_name_trgm_idx ON public.catalog_products USING gin (normalized_name gin_trgm_ops);
CREATE UNIQUE INDEX catalog_products_upc_unique_idx ON public.catalog_products USING btree (upc) WHERE (upc IS NOT NULL);
CREATE INDEX idx_certifications_company_id ON public.certifications USING btree (company_id);
CREATE INDEX idx_submissions_user_status ON public.community_submissions USING btree (user_id, status);
CREATE INDEX idx_companies_name_trgm ON public.companies USING gin (company_name gin_trgm_ops);
CREATE INDEX idx_controversies_company_id ON public.controversies USING btree (company_id);
CREATE INDEX idx_ethical_scores_company_id ON public.ethical_scores USING btree (company_id);
CREATE INDEX idx_impact_stories_company_id ON public.impact_stories USING btree (company_id);
CREATE INDEX idx_impact_stories_featured ON public.impact_stories USING btree (featured, published_at DESC);
CREATE UNIQUE INDEX product_aliases_alias_unique_idx ON public.product_aliases USING btree (lower(alias));
CREATE INDEX product_aliases_product_idx ON public.product_aliases USING btree (product_id);
CREATE INDEX product_aliases_trgm_idx ON public.product_aliases USING gin (alias gin_trgm_ops);
CREATE INDEX idx_product_features_product_id ON public.product_features USING btree (product_id);
CREATE INDEX idx_products_company_id ON public.products USING btree (company_id);
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX products_brand_id_idx ON public.products USING btree (brand_id);
CREATE INDEX products_name_trgm_idx ON public.products USING gin (name gin_trgm_ops);  -- duplicate of idx_products_name_trgm
CREATE INDEX products_source_idx ON public.products USING btree (source) WHERE (source <> 'manual'::text);
CREATE INDEX idx_receipt_items_receipt_id ON public.receipt_items USING btree (receipt_scan_id);
CREATE INDEX idx_receipt_scans_user_id ON public.receipt_scans USING btree (user_id);
CREATE INDEX retailer_categories_retailer_idx ON public.retailer_categories USING btree (retailer_id);
CREATE UNIQUE INDEX retailer_categories_unique_idx ON public.retailer_categories USING btree (retailer_id, external_category_id);
CREATE INDEX retailer_product_categories_category_idx ON public.retailer_product_categories USING btree (retailer_category_id);
CREATE INDEX retailer_products_catalog_idx ON public.retailer_products USING btree (catalog_product_id);
CREATE INDEX retailer_products_name_trgm_idx ON public.retailer_products USING gin (retailer_name gin_trgm_ops);
CREATE INDEX retailer_products_sponsored_idx ON public.retailer_products USING btree (retailer_id, is_sponsored);
CREATE UNIQUE INDEX retailer_products_unique_idx ON public.retailer_products USING btree (retailer_id, external_product_id);
CREATE INDEX retailer_request_profiles_retailer_idx ON public.retailer_request_profiles USING btree (retailer_id);
CREATE INDEX retailer_stores_retailer_idx ON public.retailer_stores USING btree (retailer_id);
CREATE UNIQUE INDEX retailer_stores_unique_idx ON public.retailer_stores USING btree (retailer_id, external_store_id);
CREATE UNIQUE INDEX retailers_provider_key_unique_idx ON public.retailers USING btree (provider_key);
CREATE INDEX idx_scan_history_user_scanned ON public.scan_history USING btree (user_id, scanned_at DESC);
CREATE INDEX scrape_job_events_job_idx ON public.scrape_job_events USING btree (scrape_job_id, created_at);
CREATE INDEX scrape_job_events_severity_idx ON public.scrape_job_events USING btree (scrape_job_id, severity);
CREATE INDEX scrape_jobs_retailer_idx ON public.scrape_jobs USING btree (retailer_id, requested_at DESC);
CREATE INDEX scrape_jobs_status_idx ON public.scrape_jobs USING btree (status, requested_at);
CREATE INDEX scrape_jobs_store_idx ON public.scrape_jobs USING btree (store_id, requested_at DESC);
CREATE INDEX store_product_price_history_sp_idx ON public.store_product_price_history USING btree (store_product_id, observed_at DESC);
CREATE INDEX store_products_availability_idx ON public.store_products USING btree (store_id, is_available_online);
CREATE INDEX store_products_checked_idx ON public.store_products USING btree (source_checked_at);
CREATE INDEX store_products_effective_price_idx ON public.store_products USING btree (store_id, effective_price);
CREATE INDEX store_products_retailer_product_idx ON public.store_products USING btree (retailer_product_id);
CREATE UNIQUE INDEX store_products_unique_idx ON public.store_products USING btree (store_id, retailer_product_id);
CREATE INDEX idx_transparency_steps_product_id ON public.transparency_steps USING btree (product_id);

-- -----------------------------------------------------------------------------
-- Views (no reloptions: neither view sets security_invoker, so both run with
-- the owner's rights and bypass RLS on the underlying tables)
-- -----------------------------------------------------------------------------
CREATE VIEW public.company_details_view AS
 SELECT id,
    slug,
    company_name,
    legal_name,
    headquarters,
    founded,
    public_or_private,
    stock_ticker,
    revenue_range,
    ceo,
    description,
    logo_url,
    parent_company_id,
    overall_ethical_rating,
    brands,
    created_at,
    updated_at,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', es.id, 'category', es.category, 'rating', es.rating, 'notes', es.notes) ORDER BY es.category) AS jsonb_agg
           FROM ethical_scores es
          WHERE (es.company_id = c.id)), '[]'::jsonb) AS ethical_scores,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', cert.id, 'name', cert.name, 'verified', cert.verified, 'verified_date', cert.verified_date)) AS jsonb_agg
           FROM certifications cert
          WHERE (cert.company_id = c.id)), '[]'::jsonb) AS certifications_list,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'reason', b.reason, 'status', b.status, 'source_url', b.source_url)) AS jsonb_agg
           FROM boycotts b
          WHERE (b.company_id = c.id)), '[]'::jsonb) AS active_boycotts,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', con.id, 'title', con.title, 'date_text', con.date_text, 'description', con.description, 'source_url', con.source_url, 'severity', con.severity)) AS jsonb_agg
           FROM controversies con
          WHERE (con.company_id = c.id)), '[]'::jsonb) AS controversies_list
   FROM companies c;

CREATE VIEW public.user_stats_view AS
 SELECT user_id,
    (count(*))::integer AS total_scans,
    (count(DISTINCT
        CASE
            WHEN (grade = ANY (ARRAY['D'::text, 'D-'::text, 'D+'::text, 'F'::text])) THEN company_id
            ELSE NULL::uuid
        END))::integer AS brands_avoided,
    (count(
        CASE
            WHEN (ethical_score >= 60) THEN 1
            ELSE NULL::integer
        END))::integer AS ethical_choices,
    COALESCE((round(avg(ethical_score)))::integer, 0) AS avg_score
   FROM scan_history sh
  GROUP BY user_id;

-- -----------------------------------------------------------------------------
-- Functions (16 user-defined; the other 31 public functions belong to pg_trgm)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_settings_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.barcodes_match(a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  na text;
  nb text;
begin
  na := ltrim(regexp_replace(coalesce(a, ''), '\D', '', 'g'), '0');
  nb := ltrim(regexp_replace(coalesce(b, ''), '\D', '', 'g'), '0');

  -- Ignore junk / too-short codes (store PLUs, quantities, prices).
  if length(na) < 6 or length(nb) < 6 then
    return false;
  end if;

  if na = nb then
    return true;
  end if;
  if length(na) = length(nb) + 1 and left(na, length(nb)) = nb then
    return true;
  end if;
  if length(nb) = length(na) + 1 and left(nb, length(na)) = na then
    return true;
  end if;
  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.brands_propagate_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.name is distinct from old.name then
    update public.products set brand = new.name where brand_id = new.id;
  end if;
  if new.company_id is distinct from old.company_id and new.company_id is not null then
    update public.products set company_id = new.company_id where brand_id = new.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.brands_sync_company_array()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.company_id is not null then
    perform public.refresh_company_brands_array(new.company_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE')
     and old.company_id is not null
     and (tg_op = 'DELETE' or old.company_id is distinct from new.company_id) then
    perform public.refresh_company_brands_array(old.company_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_content_freshness(p_companies_since timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone, p_products_since timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone, p_stories_since timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'companies_stale', EXISTS (SELECT 1 FROM public.companies WHERE updated_at > p_companies_since),
    'products_stale',  EXISTS (SELECT 1 FROM public.products  WHERE updated_at > p_products_since),
    'stories_stale',   EXISTS (SELECT 1 FROM public.impact_stories WHERE updated_at > p_stories_since)
  ) INTO v_result;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_scrape_job(p_worker_id text, p_stale_before timestamp with time zone)
 RETURNS scrape_jobs
 LANGUAGE plpgsql
AS $function$
declare
  claimed public.scrape_jobs;
begin
  select * into claimed
  from public.scrape_jobs j
  where j.status = 'queued'
     or (j.status in ('running', 'claiming') and coalesce(j.heartbeat_at, j.started_at, j.requested_at) < p_stale_before)
  order by j.requested_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.scrape_jobs
  set status = 'running',
      claimed_by = p_worker_id,
      started_at = coalesce(started_at, now()),
      heartbeat_at = now(),
      retry_count = case when claimed.status <> 'queued' then retry_count + 1 else retry_count end
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_scans', COALESCE(COUNT(*)::int, 0),
    'brands_avoided', COALESCE(COUNT(DISTINCT CASE WHEN grade IN ('D', 'D-', 'D+', 'F') THEN company_id END)::int, 0),
    'ethical_choices', COALESCE(COUNT(CASE WHEN ethical_score >= 60 THEN 1 END)::int, 0),
    'avg_score', COALESCE(ROUND(AVG(ethical_score))::int, 0)
  ) INTO v_result
  FROM public.scan_history
  WHERE user_id = p_user_id;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_receipt_items(p_queries text[], p_limit integer DEFAULT 3)
 RETURNS TABLE(query text, product_id uuid, product_name text, brand text, company_name text, ethical_score integer, grade text, confidence real, match_type text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  q text;
  qn text;   -- normalized query (digits preserved)
  qnw text;  -- normalized query with standalone numbers removed (for name fuzzy)
begin
  foreach q in array p_queries loop
    qn := public.normalize_match_text(q);
    if qn = '' then
      continue;
    end if;
    -- Drop standalone numeric tokens (barcodes, prices, quantities) so they
    -- don't dilute name fuzzy scoring. \y = word boundary; leaves tokens like
    -- "b12" intact, removes pure-digit runs.
    qnw := trim(regexp_replace(regexp_replace(qn, '\y\d+\y', ' ', 'g'), '\s+', ' ', 'g'));
    if qnw = '' then
      qnw := qn;
    end if;

    return query
    with candidates as (
      -- Barcode printed on the receipt line — most reliable.
      select p.id, 0.99::real as score, 'barcode'::text as mtype
      from public.products p
      cross join lateral (
        select t.arr[1] as code
        from regexp_matches(qn, '\d{6,}', 'g') as t(arr)
      ) codes
      where p.barcode is not null
        and public.barcodes_match(p.barcode, codes.code)

      union all
      -- Learned aliases: exact normalized hit is authoritative.
      select p.id, 1.0::real, 'alias'
      from public.product_aliases a
      join public.products p on p.id = a.product_id
      where public.normalize_match_text(a.alias) = qn

      union all
      -- Exact product name.
      select p.id, 0.98::real, 'exact'
      from public.products p
      where public.normalize_match_text(p.name) in (qn, qnw)

      union all
      -- Exact "brand + name" (receipts usually print BRAND PRODUCT).
      select p.id, 0.95::real, 'exact'
      from public.products p
      where p.brand is not null
        and public.normalize_match_text(p.brand || ' ' || p.name) in (qn, qnw)

      union all
      -- Fuzzy: trigram similarity vs name and brand+name (numbers stripped).
      select p.id,
        (greatest(
          similarity(public.normalize_match_text(p.name), qnw),
          word_similarity(public.normalize_match_text(p.name), qnw),
          case
            when p.brand is not null then
              similarity(public.normalize_match_text(p.brand || ' ' || p.name), qnw)
            else 0
          end
        ) * 0.9)::real,
        'fuzzy'
      from public.products p
      where
        similarity(public.normalize_match_text(p.name), qnw) > 0.25
        or word_similarity(public.normalize_match_text(p.name), qnw) > 0.5
        or (p.brand is not null
            and similarity(public.normalize_match_text(p.brand || ' ' || p.name), qnw) > 0.3)

      union all
      -- Fuzzy against learned aliases.
      select a.product_id,
        (similarity(public.normalize_match_text(a.alias), qnw) * 0.9)::real,
        'alias_fuzzy'
      from public.product_aliases a
      where similarity(public.normalize_match_text(a.alias), qnw) > 0.35
    ),
    ranked as (
      select c.id, max(c.score) as score,
        (array_agg(c.mtype order by c.score desc))[1] as mtype
      from candidates c
      group by c.id
      order by score desc
      limit p_limit
    )
    select
      q,
      p.id,
      p.name,
      p.brand,
      co.company_name,
      p.ethical_score,
      p.grade,
      r.score,
      r.mtype
    from ranked r
    join public.products p on p.id = r.id
    left join public.companies co on co.id = p.company_id
    order by r.score desc;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_match_text(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(regexp_replace(
    regexp_replace(replace(lower(coalesce(input, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$function$
;

CREATE OR REPLACE FUNCTION public.products_inherit_from_brand()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  b record;
begin
  if new.brand_id is not null then
    select name, company_id into b from public.brands where id = new.brand_id;
    if found then
      new.brand := b.name;
      if b.company_id is not null then
        new.company_id := b.company_id;
      end if;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_company_brands_array(p_company uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  update public.companies c
  set brands = coalesce(
    (select array_agg(b.name order by b.name)
     from public.brands b where b.company_id = p_company),
    '{}'
  )
  where c.id = p_company;
$function$
;

CREATE OR REPLACE FUNCTION public.request_scrape_job_cancel(p_id uuid)
 RETURNS scrape_jobs
 LANGUAGE plpgsql
AS $function$
declare
  updated public.scrape_jobs;
begin
  update public.scrape_jobs
  set cancel_requested_at = now(),
      status = case
        when status in ('queued') then 'cancelled'
        when status in ('running', 'claiming') then 'cancelling'
        else status
      end,
      completed_at = case when status = 'queued' then now() else completed_at end
  where id = p_id
  returning * into updated;

  return updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_all(p_query text, p_filter text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, type text, name text, subtitle text, grade text, rating text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  q text := trim(coalesce(p_query, ''));
begin
  if q = '' then
    return;
  end if;

  if p_filter in ('all', 'products') then
    return query
    select
      p.id,
      'product'::text,
      p.name,
      coalesce(
        nullif(concat_ws(' · ', p.brand, co.company_name), ''),
        coalesce(p.category, '')
      ),
      p.grade,
      null::text
    from public.products p
    left join public.companies co on co.id = p.company_id
    where p.name ilike '%' || q || '%'
       or p.brand ilike '%' || q || '%'
       or p.barcode = q
       or co.company_name ilike '%' || q || '%'
    order by (p.name ilike q || '%') desc, p.name
    limit 20;
  end if;

  if p_filter in ('all', 'companies') then
    return query
    select
      c.id,
      'company'::text,
      c.company_name,
      coalesce(c.headquarters, ''),
      null::text,
      c.overall_ethical_rating
    from public.companies c
    where c.company_name ilike '%' || q || '%'
       or exists (
         select 1 from public.brands b
         where b.company_id = c.id and b.name ilike '%' || q || '%'
       )
       or exists (
         select 1 from unnest(coalesce(c.brands, '{}')) as legacy(brand_name)
         where legacy.brand_name ilike '%' || q || '%'
       )
    order by (c.company_name ilike q || '%') desc, c.company_name
    limit 20;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER app_settings_touch_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION app_settings_touch_updated_at();
CREATE TRIGGER trg_boycotts_updated_at BEFORE UPDATE ON public.boycotts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER brands_propagate_changes AFTER UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION brands_propagate_changes();
CREATE TRIGGER brands_sync_company_array AFTER INSERT OR DELETE OR UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION brands_sync_company_array();
CREATE TRIGGER brands_touch_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER catalog_products_touch_updated_at BEFORE UPDATE ON public.catalog_products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ethical_scores_updated_at BEFORE UPDATE ON public.ethical_scores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_impact_stories_updated_at BEFORE UPDATE ON public.impact_stories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_inherit_from_brand BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION products_inherit_from_brand();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER retailer_categories_touch_updated_at BEFORE UPDATE ON public.retailer_categories FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER retailer_products_touch_updated_at BEFORE UPDATE ON public.retailer_products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER retailer_request_profiles_touch_updated_at BEFORE UPDATE ON public.retailer_request_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER retailer_stores_touch_updated_at BEFORE UPDATE ON public.retailer_stores FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER retailers_touch_updated_at BEFORE UPDATE ON public.retailers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER scrape_jobs_touch_updated_at BEFORE UPDATE ON public.scrape_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER store_products_touch_updated_at BEFORE UPDATE ON public.store_products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boycotts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controversies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethical_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impact_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_request_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailer_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_product_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transparency_steps ENABLE ROW LEVEL SECURITY;

-- Policies (27). Tables with RLS on and no policy are reachable only by the
-- service role: app_settings, product_aliases and all 11 retailer/catalog/scrape tables.
CREATE POLICY boycotts_select_public ON public.boycotts AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Brands are publicly readable" ON public.brands AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY certifications_select_public ON public.certifications AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY submissions_delete_own_pending ON public.community_submissions AS PERMISSIVE FOR DELETE TO public USING (((auth.uid() = user_id) AND (status = 'pending'::text)));
CREATE POLICY submissions_insert_auth ON public.community_submissions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY submissions_select_own ON public.community_submissions AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY submissions_update_own_pending ON public.community_submissions AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid() = user_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = 'pending'::text)));
CREATE POLICY companies_select_public ON public.companies AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY controversies_select_public ON public.controversies AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY ethical_scores_select_public ON public.ethical_scores AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY impact_stories_select_public ON public.impact_stories AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY product_features_select_public ON public.product_features AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY products_select_public ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY receipt_items_delete_own ON public.receipt_items AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM receipt_scans rs
  WHERE ((rs.id = receipt_items.receipt_scan_id) AND (rs.user_id = auth.uid())))));
CREATE POLICY receipt_items_insert_own ON public.receipt_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM receipt_scans rs
  WHERE ((rs.id = receipt_items.receipt_scan_id) AND (rs.user_id = auth.uid())))));
CREATE POLICY receipt_items_select_own ON public.receipt_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM receipt_scans rs
  WHERE ((rs.id = receipt_items.receipt_scan_id) AND (rs.user_id = auth.uid())))));
CREATE POLICY receipt_scans_delete_own ON public.receipt_scans AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY receipt_scans_insert_own ON public.receipt_scans AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY receipt_scans_select_own ON public.receipt_scans AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY receipt_scans_update_own ON public.receipt_scans AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY scan_history_delete_own ON public.scan_history AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY scan_history_insert_own ON public.scan_history AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY scan_history_select_own ON public.scan_history AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY scan_history_update_own ON public.scan_history AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY transparency_steps_select_public ON public.transparency_steps AS PERMISSIVE FOR SELECT TO public USING (true);

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.brands IS 'Consumer-facing brands. company_id is the owning (parent) company; products inherit their company through their brand.';
COMMENT ON TABLE public.catalog_products IS 'Canonical grocery product identity shared across retailers/stores. Metadata stored once here; per-store price/availability lives in store_products. Distinct from public.products (ethical catalogue).';
COMMENT ON TABLE public.product_aliases IS 'Raw text strings (mostly receipt abbreviations) known to refer to a product. Grown from admin corrections so receipt matching improves over time.';
COMMENT ON COLUMN public.products.brand IS 'Consumer-facing brand on the packaging (e.g. Unico), distinct from the owning company (company_id).';
COMMENT ON TABLE public.retailer_categories IS 'Retailer catalogue categories (e.g. Fortinos 28000 Fruits & Vegetables). external_category_id is used to address the listing endpoint.';
COMMENT ON COLUMN public.retailer_categories.url_path IS 'Retailer URL slug path used to address the listing route (e.g. Fortinos "food/dairy-eggs" in /en/food/dairy-eggs/c/28003). Required for Next.js-data providers.';
COMMENT ON TABLE public.retailer_product_categories IS 'Which retailer categories a retailer product appears in.';
COMMENT ON TABLE public.retailer_products IS 'A retailer''s own product listing, mapped to a canonical catalog_product. Unique per (retailer, external_product_id).';
COMMENT ON COLUMN public.retailer_products.is_sponsored IS 'True when the retailer surfaced this product as a sponsored/ad tile in a listing. Flagged, not dropped, so admins can filter.';
COMMENT ON TABLE public.retailer_request_profiles IS 'Replayable, sanitized retailer request templates. NEVER store session cookies or credentials here.';
COMMENT ON TABLE public.retailer_stores IS 'An individual physical/online store belonging to a retailer. external_store_id is the retailer-native store identifier used when building catalogue requests.';
COMMENT ON TABLE public.retailers IS 'A grocery retailer / catalogue source. provider_key selects the scraping implementation in catalog-worker. Do not store secrets in configuration_json.';
COMMENT ON TABLE public.scrape_job_events IS 'Structured progress + sanitized error events for a scrape job. Never store cookies/tokens/unrestricted headers here.';
COMMENT ON TABLE public.scrape_jobs IS 'Admin-created catalogue ingestion jobs. The catalog-worker claims queued jobs atomically via claim_scrape_job().';
COMMENT ON TABLE public.store_product_price_history IS 'Append-only history; a row is inserted only when a meaningful price/promotion field changes.';
COMMENT ON TABLE public.store_products IS 'Current observed price + online-catalogue availability of a retailer product at a specific store. is_available_online is NULL when the retailer supplies no inventory signal — never coerced to true. Updated via upsert.';

-- -----------------------------------------------------------------------------
-- Storage: no buckets exist (storage.buckets is empty); no storage policies.
-- -----------------------------------------------------------------------------
