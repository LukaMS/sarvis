export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_calls: {
        Row: {
          at: string
          cost_usd: number
          id: number
          input_tokens: number
          latency_ms: number | null
          mock: boolean
          model: string
          output_tokens: number
          prompt_version: string
          purpose: string
          response_raw_object_id: string | null
          rubric_version: string | null
          run_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          at?: string
          cost_usd?: number
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          mock?: boolean
          model: string
          output_tokens?: number
          prompt_version: string
          purpose: string
          response_raw_object_id?: string | null
          rubric_version?: string | null
          run_id?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          at?: string
          cost_usd?: number
          id?: never
          input_tokens?: number
          latency_ms?: number | null
          mock?: boolean
          model?: string
          output_tokens?: number
          prompt_version?: string
          purpose?: string
          response_raw_object_id?: string | null
          rubric_version?: string | null
          run_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_response_raw_object_id_fkey"
            columns: ["response_raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          changes: Json
          id: number
          note: string | null
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          changes?: Json
          id?: never
          note?: string | null
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          changes?: Json
          id?: never
          note?: string | null
          row_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          country: string | null
          created_at: string
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          name: string
          operator_company_id: string | null
          raw_object_id: string | null
          slug: string
          source_id: string
          source_url: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          name: string
          operator_company_id?: string | null
          raw_object_id?: string | null
          slug: string
          source_id: string
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          name?: string
          operator_company_id?: string | null
          raw_object_id?: string | null
          slug?: string
          source_id?: string
          source_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_operator_company_id_fkey"
            columns: ["operator_company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "banners_operator_company_id_fkey"
            columns: ["operator_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_operator_company_id_fkey"
            columns: ["operator_company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "banners_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_ownership: {
        Row: {
          ai_call_id: number | null
          brand_id: string
          company_id: string
          confidence: number | null
          created_at: string
          decision_method: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          match_candidate_id: number | null
          method: string
          method_version: string
          raw_object_id: string | null
          relation: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          source_url: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          ai_call_id?: number | null
          brand_id: string
          company_id: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          match_candidate_id?: number | null
          method: string
          method_version: string
          raw_object_id?: string | null
          relation: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          source_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          ai_call_id?: number | null
          brand_id?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          match_candidate_id?: number | null
          method?: string
          method_version?: string
          raw_object_id?: string | null
          relation?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          source_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_ownership_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_ownership_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_ownership_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "brand_ownership_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "brand_ownership_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_match_candidate_id_fkey"
            columns: ["match_candidate_id"]
            isOneToOne: false
            referencedRelation: "match_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_ownership_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          aliases: string[]
          created_at: string
          description: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          is_private_label: boolean
          locked_fields: string[]
          logo_url: string | null
          merged_into_id: string | null
          method: string
          method_version: string
          name: string
          raw_object_id: string | null
          slug: string
          source_id: string
          source_url: string | null
          status: string
          updated_at: string
          website: string | null
          wikidata_qid: string | null
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          description?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          is_private_label?: boolean
          locked_fields?: string[]
          logo_url?: string | null
          merged_into_id?: string | null
          method: string
          method_version: string
          name: string
          raw_object_id?: string | null
          slug: string
          source_id: string
          source_url?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          wikidata_qid?: string | null
        }
        Update: {
          aliases?: string[]
          created_at?: string
          description?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          is_private_label?: boolean
          locked_fields?: string[]
          logo_url?: string | null
          merged_into_id?: string | null
          method?: string
          method_version?: string
          name?: string
          raw_object_id?: string | null
          slug?: string
          source_id?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          wikidata_qid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brands_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brands_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          level: number
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: number
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_mappings: {
        Row: {
          ai_call_id: number | null
          category_id: string
          confidence: number | null
          created_at: string
          decision_method: string | null
          fetched_at: string
          id: number
          ingestion_run_id: string | null
          method: string
          method_version: string
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_category_key: string
          source_id: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          ai_call_id?: number | null
          category_id: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at: string
          id?: never
          ingestion_run_id?: string | null
          method: string
          method_version: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_category_key: string
          source_id: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          ai_call_id?: number | null
          category_id?: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at?: string
          id?: never
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_category_key?: string
          source_id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_mappings_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          brand_id: string | null
          certified_on: string | null
          company_id: string | null
          created_at: string
          decision_method: string | null
          document_id: string | null
          expires_on: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          product_id: string | null
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          scheme: string
          scheme_name: string | null
          score: number | null
          source_id: string
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          certified_on?: string | null
          company_id?: string | null
          created_at?: string
          decision_method?: string | null
          document_id?: string | null
          expires_on?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          product_id?: string | null
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme: string
          scheme_name?: string | null
          score?: number | null
          source_id: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          certified_on?: string | null
          company_id?: string | null
          created_at?: string
          decision_method?: string | null
          document_id?: string | null
          expires_on?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          product_id?: string | null
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme?: string
          scheme_name?: string | null
          score?: number | null
          source_id?: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "certifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "certifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "certifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "certifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "certifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          aliases: string[]
          ceo: string | null
          corp_canada_number: string | null
          country: string | null
          created_at: string
          description: string | null
          fetched_at: string
          founded_year: number | null
          headquarters: string | null
          id: string
          ingestion_run_id: string | null
          kind: string
          legal_name: string | null
          locked_fields: string[]
          logo_url: string | null
          merged_into_id: string | null
          method: string
          method_version: string
          name: string
          opencorporates_id: string | null
          ownership_type: string | null
          raw_object_id: string | null
          revenue_range: string | null
          sec_cik: string | null
          slug: string
          source_id: string
          source_url: string | null
          status: string
          stock_ticker: string | null
          updated_at: string
          website: string | null
          wikidata_qid: string | null
          wikipedia_revision_id: number | null
          wikipedia_title: string | null
        }
        Insert: {
          aliases?: string[]
          ceo?: string | null
          corp_canada_number?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          fetched_at: string
          founded_year?: number | null
          headquarters?: string | null
          id?: string
          ingestion_run_id?: string | null
          kind?: string
          legal_name?: string | null
          locked_fields?: string[]
          logo_url?: string | null
          merged_into_id?: string | null
          method: string
          method_version: string
          name: string
          opencorporates_id?: string | null
          ownership_type?: string | null
          raw_object_id?: string | null
          revenue_range?: string | null
          sec_cik?: string | null
          slug: string
          source_id: string
          source_url?: string | null
          status?: string
          stock_ticker?: string | null
          updated_at?: string
          website?: string | null
          wikidata_qid?: string | null
          wikipedia_revision_id?: number | null
          wikipedia_title?: string | null
        }
        Update: {
          aliases?: string[]
          ceo?: string | null
          corp_canada_number?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          fetched_at?: string
          founded_year?: number | null
          headquarters?: string | null
          id?: string
          ingestion_run_id?: string | null
          kind?: string
          legal_name?: string | null
          locked_fields?: string[]
          logo_url?: string | null
          merged_into_id?: string | null
          method?: string
          method_version?: string
          name?: string
          opencorporates_id?: string | null
          ownership_type?: string | null
          raw_object_id?: string | null
          revenue_range?: string | null
          sec_cik?: string | null
          slug?: string
          source_id?: string
          source_url?: string | null
          status?: string
          stock_ticker?: string | null
          updated_at?: string
          website?: string | null
          wikidata_qid?: string | null
          wikipedia_revision_id?: number | null
          wikipedia_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "companies_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "companies_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      company_events: {
        Row: {
          company_id: string
          created_at: string
          date_text: string | null
          decision_method: string | null
          description: string | null
          document_id: string | null
          event_date: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          kind: string
          method: string
          method_version: string
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          source_id: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date_text?: string | null
          decision_method?: string | null
          description?: string | null
          document_id?: string | null
          event_date?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          kind: string
          method: string
          method_version: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          source_id: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date_text?: string | null
          decision_method?: string | null
          description?: string | null
          document_id?: string | null
          event_date?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          kind?: string
          method?: string
          method_version?: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          source_id?: string
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "company_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_events_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_events_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_events_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ownership: {
        Row: {
          ai_call_id: number | null
          child_company_id: string
          confidence: number | null
          created_at: string
          decision_method: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          parent_company_id: string
          raw_object_id: string | null
          relation: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          share_pct: number | null
          source_id: string
          source_url: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          ai_call_id?: number | null
          child_company_id: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          parent_company_id: string
          raw_object_id?: string | null
          relation: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          share_pct?: number | null
          source_id: string
          source_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          ai_call_id?: number | null
          child_company_id?: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          parent_company_id?: string
          raw_object_id?: string | null
          relation?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          share_pct?: number | null
          source_id?: string
          source_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ownership_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ownership_child_company_id_fkey"
            columns: ["child_company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_ownership_child_company_id_fkey"
            columns: ["child_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ownership_child_company_id_fkey"
            columns: ["child_company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "company_ownership_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ownership_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_ownership_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ownership_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "company_ownership_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ownership_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ownership_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      company_scores: {
        Row: {
          ai_call_id: number | null
          category: string
          company_id: string
          confidence: number | null
          created_at: string
          decision_method: string | null
          fetched_at: string
          grade: string | null
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          model: string | null
          rating: string | null
          rationale: string | null
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          rubric_id: string | null
          score: number | null
          source_id: string
          source_url: string | null
          superseded_by_id: string | null
          updated_at: string
        }
        Insert: {
          ai_call_id?: number | null
          category: string
          company_id: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at: string
          grade?: string | null
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          model?: string | null
          rating?: string | null
          rationale?: string | null
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_id?: string | null
          score?: number | null
          source_id: string
          source_url?: string | null
          superseded_by_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_call_id?: number | null
          category?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          decision_method?: string | null
          fetched_at?: string
          grade?: string | null
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          model?: string | null
          rating?: string | null
          rationale?: string | null
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rubric_id?: string | null
          score?: number | null
          source_id?: string
          source_url?: string | null
          superseded_by_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_scores_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "company_scores_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "company_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "published_company_scores"
            referencedColumns: ["score_id"]
          },
        ]
      }
      document_entities: {
        Row: {
          ai_call_id: number | null
          brand_id: string | null
          categories: string[]
          company_id: string | null
          created_at: string
          decision_method: string | null
          document_id: string
          fetched_at: string
          id: number
          ingestion_run_id: string | null
          method: string
          method_version: string
          model: string | null
          raw_object_id: string | null
          relevance: number
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          source_url: string | null
          stance: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          ai_call_id?: number | null
          brand_id?: string | null
          categories?: string[]
          company_id?: string | null
          created_at?: string
          decision_method?: string | null
          document_id: string
          fetched_at: string
          id?: never
          ingestion_run_id?: string | null
          method: string
          method_version: string
          model?: string | null
          raw_object_id?: string | null
          relevance: number
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          source_url?: string | null
          stance: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          ai_call_id?: number | null
          brand_id?: string | null
          categories?: string[]
          company_id?: string | null
          created_at?: string
          decision_method?: string | null
          document_id?: string
          fetched_at?: string
          id?: never
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          model?: string | null
          raw_object_id?: string | null
          relevance?: number
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          source_url?: string | null
          stance?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_entities_ai_call_id_fkey"
            columns: ["ai_call_id"]
            isOneToOne: false
            referencedRelation: "ai_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "document_entities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "document_entities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "document_entities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "document_entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archive_url: string | null
          created_at: string
          domain: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          kind: string
          language: string | null
          method: string
          method_version: string
          published_at: string | null
          publisher: string | null
          raw_object_id: string | null
          sec_accession: string | null
          sec_filed_on: string | null
          source_id: string
          source_url: string | null
          title: string | null
          updated_at: string
          url: string
          url_normalized: string
          wikipedia_revision_id: number | null
        }
        Insert: {
          archive_url?: string | null
          created_at?: string
          domain?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          kind: string
          language?: string | null
          method: string
          method_version: string
          published_at?: string | null
          publisher?: string | null
          raw_object_id?: string | null
          sec_accession?: string | null
          sec_filed_on?: string | null
          source_id: string
          source_url?: string | null
          title?: string | null
          updated_at?: string
          url: string
          url_normalized: string
          wikipedia_revision_id?: number | null
        }
        Update: {
          archive_url?: string | null
          created_at?: string
          domain?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          kind?: string
          language?: string | null
          method?: string
          method_version?: string
          published_at?: string | null
          publisher?: string | null
          raw_object_id?: string | null
          sec_accession?: string | null
          sec_filed_on?: string | null
          source_id?: string
          source_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string
          url_normalized?: string
          wikipedia_revision_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      external_ratings: {
        Row: {
          company_id: string
          created_at: string
          decision_method: string | null
          document_id: string
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          max_score: number
          method: string
          method_version: string
          period: string
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          scheme: string
          score: number
          source_id: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decision_method?: string | null
          document_id: string
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          max_score: number
          method: string
          method_version: string
          period: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme: string
          score: number
          source_id: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decision_method?: string | null
          document_id?: string
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          max_score?: number
          method?: string
          method_version?: string
          period?: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scheme?: string
          score?: number
          source_id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_ratings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "external_ratings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ratings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "external_ratings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ratings_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ratings_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ratings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_ratings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_run_events: {
        Row: {
          at: string
          details: Json | null
          event_type: string
          id: number
          message: string
          run_id: string
          severity: string
        }
        Insert: {
          at?: string
          details?: Json | null
          event_type: string
          id?: never
          message: string
          run_id: string
          severity: string
        }
        Update: {
          at?: string
          details?: Json | null
          event_type?: string
          id?: never
          message?: string
          run_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          actions_run_url: string | null
          counts: Json
          dump_fetched_at: string | null
          dump_sha256: string | null
          dump_url: string | null
          error_summary: string | null
          expected_total: number | null
          finished_at: string | null
          git_sha: string | null
          id: string
          job: string
          job_version: string
          mode: string
          sample_size: number | null
          source_id: string
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          actions_run_url?: string | null
          counts?: Json
          dump_fetched_at?: string | null
          dump_sha256?: string | null
          dump_url?: string | null
          error_summary?: string | null
          expected_total?: number | null
          finished_at?: string | null
          git_sha?: string | null
          id?: string
          job: string
          job_version: string
          mode: string
          sample_size?: number | null
          source_id: string
          started_at?: string
          status?: string
          triggered_by: string
        }
        Update: {
          actions_run_url?: string | null
          counts?: Json
          dump_fetched_at?: string | null
          dump_sha256?: string | null
          dump_url?: string | null
          error_summary?: string | null
          expected_total?: number | null
          finished_at?: string | null
          git_sha?: string | null
          id?: string
          job?: string
          job_version?: string
          mode?: string
          sample_size?: number | null
          source_id?: string
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          code: string
          created_at: string
          id: number
          name: string
          off_tags: string[]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id: number
          name: string
          off_tags?: string[]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: number
          name?: string
          off_tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      match_candidates: {
        Row: {
          candidate_id: string
          candidate_type: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_method: string | null
          features: Json | null
          id: number
          kind: string
          match_method: string
          match_method_version: string
          reason: string | null
          run_id: string | null
          score: number
          status: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          candidate_id: string
          candidate_type: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_method?: string | null
          features?: Json | null
          id?: never
          kind: string
          match_method: string
          match_method_version: string
          reason?: string | null
          run_id?: string | null
          score: number
          status?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          candidate_id?: string
          candidate_type?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_method?: string | null
          features?: Json | null
          id?: never
          kind?: string
          match_method?: string
          match_method_version?: string
          reason?: string | null
          run_id?: string | null
          score?: number
          status?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_candidates_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      price_observations: {
        Row: {
          created_at: string
          currency: string
          external_id: string | null
          fetched_at: string
          id: number
          ingestion_run_id: string | null
          is_discounted: boolean
          last_confirmed_on: string | null
          listing_id: string | null
          method: string
          method_version: string
          observed_on: string
          price: number
          price_kind: string
          price_per: string | null
          price_without_discount: number | null
          product_id: string | null
          raw_object_id: string | null
          source_id: string
          source_url: string | null
          store_id: string
          unit_basis: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          external_id?: string | null
          fetched_at: string
          id?: never
          ingestion_run_id?: string | null
          is_discounted?: boolean
          last_confirmed_on?: string | null
          listing_id?: string | null
          method: string
          method_version: string
          observed_on: string
          price: number
          price_kind?: string
          price_per?: string | null
          price_without_discount?: number | null
          product_id?: string | null
          raw_object_id?: string | null
          source_id: string
          source_url?: string | null
          store_id: string
          unit_basis?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          external_id?: string | null
          fetched_at?: string
          id?: never
          ingestion_run_id?: string | null
          is_discounted?: boolean
          last_confirmed_on?: string | null
          listing_id?: string | null
          method?: string
          method_version?: string
          observed_on?: string
          price?: number
          price_kind?: string
          price_per?: string | null
          price_without_discount?: number | null
          product_id?: string | null
          raw_object_id?: string | null
          source_id?: string
          source_url?: string | null
          store_id?: string
          unit_basis?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_observations_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "store_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      price_points_monthly: {
        Row: {
          avg_price: number
          banner_id: string | null
          created_at: string
          fetched_at: string
          id: number
          max_price: number
          method: string
          method_version: string
          min_price: number
          month: string
          n: number
          product_id: string
          source_id: string
          source_mix: string[]
          store_id: string | null
          updated_at: string
        }
        Insert: {
          avg_price: number
          banner_id?: string | null
          created_at?: string
          fetched_at: string
          id?: never
          max_price: number
          method?: string
          method_version: string
          min_price: number
          month: string
          n: number
          product_id: string
          source_id: string
          source_mix?: string[]
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          avg_price?: number
          banner_id?: string | null
          created_at?: string
          fetched_at?: string
          id?: never
          max_price?: number
          method?: string
          method_version?: string
          min_price?: number
          month?: string
          n?: number
          product_id?: string
          source_id?: string
          source_mix?: string[]
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_points_monthly_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_monthly_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_points_monthly_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_monthly_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_monthly_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_monthly_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      price_points_weekly: {
        Row: {
          created_at: string
          fetched_at: string
          id: number
          max_price: number
          median_price: number
          method: string
          method_version: string
          min_price: number
          n_lines: number
          n_receipts: number
          product_id: string
          source_id: string
          store_id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          fetched_at: string
          id?: never
          max_price: number
          median_price: number
          method?: string
          method_version: string
          min_price: number
          n_lines: number
          n_receipts: number
          product_id: string
          source_id: string
          store_id: string
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: never
          max_price?: number
          median_price?: number
          method?: string
          method_version?: string
          min_price?: number
          n_lines?: number
          n_receipts?: number
          product_id?: string
          source_id?: string
          store_id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_points_weekly_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_points_weekly_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_weekly_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_weekly_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_points_weekly_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      price_sanity_bounds: {
        Row: {
          basis: string
          category_id: string
          created_at: string
          id: number
          max_unit_price: number
          min_unit_price: number
          unit_basis: string
          updated_at: string
        }
        Insert: {
          basis: string
          category_id: string
          created_at?: string
          id?: never
          max_unit_price: number
          min_unit_price: number
          unit_basis: string
          updated_at?: string
        }
        Update: {
          basis?: string
          category_id?: string
          created_at?: string
          id?: never
          max_unit_price?: number
          min_unit_price?: number
          unit_basis?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_sanity_bounds_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          created_at: string
          decision_method: string | null
          description: string | null
          fetched_at: string
          icon: string
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          product_id: string
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          source_id: string
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_method?: string | null
          description?: string | null
          fetched_at: string
          icon: string
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          product_id: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          source_id: string
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_method?: string | null
          description?: string | null
          fetched_at?: string
          icon?: string
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          product_id?: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          source_id?: string
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      product_identifiers: {
        Row: {
          banner_id: string | null
          created_at: string
          fetched_at: string
          id: number
          ingestion_run_id: string | null
          method: string
          method_version: string
          product_id: string
          raw_object_id: string | null
          scheme: string
          source_id: string
          source_url: string | null
          updated_at: string
          value: string
        }
        Insert: {
          banner_id?: string | null
          created_at?: string
          fetched_at: string
          id?: never
          ingestion_run_id?: string | null
          method: string
          method_version: string
          product_id: string
          raw_object_id?: string | null
          scheme: string
          source_id: string
          source_url?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          banner_id?: string | null
          created_at?: string
          fetched_at?: string
          id?: never
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          product_id?: string
          raw_object_id?: string | null
          scheme?: string
          source_id?: string
          source_url?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_identifiers_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_identifiers_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_identifiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_identifiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_identifiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_identifiers_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_identifiers_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sources: {
        Row: {
          content_hash: string | null
          created_at: string
          external_id: string
          fetched_at: string
          id: number
          last_seen_at: string
          method: string
          method_version: string
          product_id: string
          source_id: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          external_id: string
          fetched_at: string
          id?: never
          last_seen_at: string
          method: string
          method_version: string
          product_id: string
          source_id: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          external_id?: string
          fetched_at?: string
          id?: never
          last_seen_at?: string
          method?: string
          method_version?: string
          product_id?: string
          source_id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sources_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          brand_text: string | null
          category_id: string | null
          content_hash: string | null
          created_at: string
          description: string | null
          external_id: string
          fetched_at: string
          gtin: string | null
          id: string
          image_key: string | null
          ingestion_run_id: string | null
          label_codes: number[]
          locked_fields: string[]
          merged_into_id: string | null
          method: string
          method_version: string
          name: string
          net_quantity: number | null
          net_unit: string | null
          pack_count: number | null
          quantity_text: string | null
          raw_object_id: string | null
          source_id: string
          source_modified_at: string | null
          source_url: string | null
          status: string
          unit_parse_status: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          brand_text?: string | null
          category_id?: string | null
          content_hash?: string | null
          created_at?: string
          description?: string | null
          external_id: string
          fetched_at: string
          gtin?: string | null
          id?: string
          image_key?: string | null
          ingestion_run_id?: string | null
          label_codes?: number[]
          locked_fields?: string[]
          merged_into_id?: string | null
          method: string
          method_version: string
          name: string
          net_quantity?: number | null
          net_unit?: string | null
          pack_count?: number | null
          quantity_text?: string | null
          raw_object_id?: string | null
          source_id: string
          source_modified_at?: string | null
          source_url?: string | null
          status?: string
          unit_parse_status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          brand_text?: string | null
          category_id?: string | null
          content_hash?: string | null
          created_at?: string
          description?: string | null
          external_id?: string
          fetched_at?: string
          gtin?: string | null
          id?: string
          image_key?: string | null
          ingestion_run_id?: string | null
          label_codes?: number[]
          locked_fields?: string[]
          merged_into_id?: string | null
          method?: string
          method_version?: string
          name?: string
          net_quantity?: number | null
          net_unit?: string | null
          pack_count?: number | null
          quantity_text?: string | null
          raw_object_id?: string | null
          source_id?: string
          source_modified_at?: string | null
          source_url?: string | null
          status?: string
          unit_parse_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          consent_at: string | null
          created_at: string
          display_name: string | null
          id: string
          role: string
          share_prices_consent: boolean
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
          share_prices_consent?: boolean
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          share_prices_consent?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      raw_objects: {
        Row: {
          byte_size: number
          content_sha256: string
          content_type: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          fetched_at: string
          http_status: number | null
          id: string
          request_url: string | null
          run_id: string | null
          source_id: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          content_sha256: string
          content_type: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          fetched_at: string
          http_status?: number | null
          id?: string
          request_url?: string | null
          run_id?: string | null
          source_id: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          content_sha256?: string
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          fetched_at?: string
          http_status?: number | null
          id?: string
          request_url?: string | null
          run_id?: string | null
          source_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_objects_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_objects_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_prices: {
        Row: {
          category_id: string | null
          created_at: string
          fetched_at: string
          geography: string
          id: number
          ingestion_run_id: string | null
          method: string
          method_version: string
          product_label: string
          raw_object_id: string | null
          ref_month: string
          source_id: string
          source_url: string | null
          unit: string | null
          updated_at: string
          value: number
          vector_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          fetched_at: string
          geography: string
          id?: never
          ingestion_run_id?: string | null
          method: string
          method_version: string
          product_label: string
          raw_object_id?: string | null
          ref_month: string
          source_id: string
          source_url?: string | null
          unit?: string | null
          updated_at?: string
          value: number
          vector_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          fetched_at?: string
          geography?: string
          id?: never
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          product_label?: string
          raw_object_id?: string | null
          ref_month?: string
          source_id?: string
          source_url?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
          vector_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_prices_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_prices_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_prices_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_prices_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      review_queue: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: number
          item_id: string
          item_table: string
          item_type: string
          priority: number
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: never
          item_id: string
          item_table: string
          item_type: string
          priority?: number
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: never
          item_id?: string
          item_table?: string
          item_type?: string
          priority?: number
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          approved_by_owner_at: string | null
          categories: Json
          created_at: string
          doc_url: string | null
          evidence_rules: string
          grade_thresholds: Json
          id: string
          published_at: string | null
          updated_at: string
          version: string
        }
        Insert: {
          approved_by_owner_at?: string | null
          categories: Json
          created_at?: string
          doc_url?: string | null
          evidence_rules: string
          grade_thresholds: Json
          id?: string
          published_at?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          approved_by_owner_at?: string | null
          categories?: Json
          created_at?: string
          doc_url?: string | null
          evidence_rules?: string
          grade_thresholds?: Json
          id?: string
          published_at?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      score_citations: {
        Row: {
          added_by_method: string
          created_at: string
          document_id: string
          id: number
          quote: string | null
          score_id: string
          stance: string
        }
        Insert: {
          added_by_method: string
          created_at?: string
          document_id: string
          id?: never
          quote?: string | null
          score_id: string
          stance: string
        }
        Update: {
          added_by_method?: string
          created_at?: string
          document_id?: string
          id?: never
          quote?: string | null
          score_id?: string
          stance?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_citations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_citations_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "company_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_citations_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "published_company_scores"
            referencedColumns: ["score_id"]
          },
        ]
      }
      sources: {
        Row: {
          access_method: string
          attribution_text: string | null
          created_at: string
          enabled: boolean
          homepage_url: string | null
          id: string
          key: string
          licence: string | null
          licence_url: string | null
          name: string
          rate_limit_per_sec: number
          refresh_interval: string | null
          sources_md_id: string | null
          terms_checked_at: string | null
          terms_url: string | null
          updated_at: string
          url_template: string | null
          verdict: string
        }
        Insert: {
          access_method: string
          attribution_text?: string | null
          created_at?: string
          enabled?: boolean
          homepage_url?: string | null
          id?: string
          key: string
          licence?: string | null
          licence_url?: string | null
          name: string
          rate_limit_per_sec?: number
          refresh_interval?: string | null
          sources_md_id?: string | null
          terms_checked_at?: string | null
          terms_url?: string | null
          updated_at?: string
          url_template?: string | null
          verdict: string
        }
        Update: {
          access_method?: string
          attribution_text?: string | null
          created_at?: string
          enabled?: boolean
          homepage_url?: string | null
          id?: string
          key?: string
          licence?: string | null
          licence_url?: string | null
          name?: string
          rate_limit_per_sec?: number
          refresh_interval?: string | null
          sources_md_id?: string | null
          terms_checked_at?: string | null
          terms_url?: string | null
          updated_at?: string
          url_template?: string | null
          verdict?: string
        }
        Relationships: []
      }
      store_listings: {
        Row: {
          banner_id: string
          created_at: string
          external_sku: string | null
          fetched_at: string
          first_seen_at: string
          id: string
          ingestion_run_id: string | null
          is_active: boolean
          last_seen_at: string
          listing_key: string | null
          listing_name: string
          match_candidate_id: number | null
          method: string
          method_version: string
          product_id: string | null
          raw_object_id: string | null
          size_text: string | null
          source_id: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          banner_id: string
          created_at?: string
          external_sku?: string | null
          fetched_at: string
          first_seen_at: string
          id?: string
          ingestion_run_id?: string | null
          is_active?: boolean
          last_seen_at: string
          listing_key?: string | null
          listing_name: string
          match_candidate_id?: number | null
          method: string
          method_version: string
          product_id?: string | null
          raw_object_id?: string | null
          size_text?: string | null
          source_id: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          banner_id?: string
          created_at?: string
          external_sku?: string | null
          fetched_at?: string
          first_seen_at?: string
          id?: string
          ingestion_run_id?: string | null
          is_active?: boolean
          last_seen_at?: string
          listing_key?: string | null
          listing_name?: string
          match_candidate_id?: number | null
          method?: string
          method_version?: string
          product_id?: string | null
          raw_object_id?: string | null
          size_text?: string | null
          source_id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listings_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_match_candidate_id_fkey"
            columns: ["match_candidate_id"]
            isOneToOne: false
            referencedRelation: "match_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "store_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          banner_id: string | null
          city: string | null
          created_at: string
          external_store_id: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          lat: number | null
          lon: number | null
          method: string
          method_version: string
          name: string
          osm_id: number | null
          osm_type: string | null
          postal_code: string | null
          province: string | null
          raw_object_id: string | null
          slug: string
          source_id: string
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          banner_id?: string | null
          city?: string | null
          created_at?: string
          external_store_id?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          lat?: number | null
          lon?: number | null
          method: string
          method_version: string
          name: string
          osm_id?: number | null
          osm_type?: string | null
          postal_code?: string | null
          province?: string | null
          raw_object_id?: string | null
          slug: string
          source_id: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          banner_id?: string | null
          city?: string | null
          created_at?: string
          external_store_id?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          lat?: number | null
          lon?: number | null
          method?: string
          method_version?: string
          name?: string
          osm_id?: number | null
          osm_type?: string | null
          postal_code?: string | null
          province?: string | null
          raw_object_id?: string | null
          slug?: string
          source_id?: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          body: string | null
          category: string | null
          company_id: string | null
          cover_image_path: string | null
          created_at: string
          featured: boolean
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          published_at: string | null
          raw_object_id: string | null
          slug: string
          source_id: string
          source_url: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          category?: string | null
          company_id?: string | null
          cover_image_path?: string | null
          created_at?: string
          featured?: boolean
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          published_at?: string | null
          raw_object_id?: string | null
          slug: string
          source_id: string
          source_url?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          category?: string | null
          company_id?: string | null
          cover_image_path?: string | null
          created_at?: string
          featured?: boolean
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          published_at?: string | null
          raw_object_id?: string | null
          slug?: string
          source_id?: string
          source_url?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "stories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "stories_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      transparency_steps: {
        Row: {
          created_at: string
          decision_method: string | null
          description: string | null
          fetched_at: string
          id: string
          ingestion_run_id: string | null
          method: string
          method_version: string
          product_id: string
          raw_object_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          source_url: string | null
          step: string
          step_number: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_method?: string | null
          description?: string | null
          fetched_at: string
          id?: string
          ingestion_run_id?: string | null
          method: string
          method_version: string
          product_id: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          source_url?: string | null
          step: string
          step_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_method?: string | null
          description?: string | null
          fetched_at?: string
          id?: string
          ingestion_run_id?: string | null
          method?: string
          method_version?: string
          product_id?: string
          raw_object_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          source_url?: string | null
          step?: string
          step_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transparency_steps_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_steps_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "transparency_steps_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_steps_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_steps_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_steps_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transparency_steps_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_failures: {
        Row: {
          created_at: string
          id: number
          message: string
          payload: Json | null
          raw_object_id: string | null
          record_key: string | null
          rule: string
          run_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          message: string
          payload?: Json | null
          raw_object_id?: string | null
          record_key?: string | null
          rule: string
          run_id: string
        }
        Update: {
          created_at?: string
          id?: never
          message?: string
          payload?: Json | null
          raw_object_id?: string | null
          record_key?: string | null
          rule?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_failures_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_failures_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      brand_current_owner: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          brand_slug: string | null
          company_id: string | null
          company_name: string | null
          company_slug: string | null
          confidence: number | null
          relation: string | null
          valid_from: string | null
        }
        Relationships: []
      }
      company_ultimate_parent: {
        Row: {
          company_id: string | null
          depth: number | null
          path: string[] | null
          ultimate_parent_id: string | null
          ultimate_parent_name: string | null
          ultimate_parent_slug: string | null
        }
        Relationships: []
      }
      current_prices: {
        Row: {
          as_of: string | null
          currency: string | null
          effective_price: number | null
          fetched_at: string | null
          observation_id: number | null
          origin: string | null
          price_kind: string | null
          product_id: string | null
          source_id: string | null
          store_id: string | null
          unit_basis: string | null
          unit_price: number | null
          weekly_id: number | null
        }
        Relationships: []
      }
      price_observations_with_source_url: {
        Row: {
          created_at: string | null
          currency: string | null
          external_id: string | null
          fetched_at: string | null
          id: number | null
          ingestion_run_id: string | null
          is_discounted: boolean | null
          last_confirmed_on: string | null
          listing_id: string | null
          method: string | null
          method_version: string | null
          observed_on: string | null
          price: number | null
          price_kind: string | null
          price_per: string | null
          price_without_discount: number | null
          product_id: string | null
          raw_object_id: string | null
          resolved_source_url: string | null
          source_id: string | null
          source_url: string | null
          store_id: string | null
          unit_basis: string | null
          unit_price: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_observations_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "store_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ownership_chain: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          brand_slug: string | null
          gtin: string | null
          owner_company_id: string | null
          owner_company_name: string | null
          owner_company_slug: string | null
          owner_relation: string | null
          ownership_depth: number | null
          ownership_path: string[] | null
          product_id: string | null
          product_name: string | null
          ultimate_parent_id: string | null
          ultimate_parent_name: string | null
          ultimate_parent_slug: string | null
        }
        Relationships: []
      }
      products_with_source_url: {
        Row: {
          brand_id: string | null
          brand_text: string | null
          category_id: string | null
          content_hash: string | null
          created_at: string | null
          description: string | null
          external_id: string | null
          fetched_at: string | null
          gtin: string | null
          id: string | null
          image_key: string | null
          ingestion_run_id: string | null
          label_codes: number[] | null
          locked_fields: string[] | null
          merged_into_id: string | null
          method: string | null
          method_version: string | null
          name: string | null
          net_quantity: number | null
          net_unit: string | null
          pack_count: number | null
          quantity_text: string | null
          raw_object_id: string | null
          resolved_source_url: string | null
          source_id: string | null
          source_modified_at: string | null
          source_url: string | null
          status: string | null
          unit_parse_status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products_with_source_url"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_raw_object_id_fkey"
            columns: ["raw_object_id"]
            isOneToOne: false
            referencedRelation: "raw_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      published_company_scores: {
        Row: {
          category: string | null
          company_id: string | null
          confidence: number | null
          fetched_at: string | null
          grade: string | null
          method: string | null
          method_version: string | null
          model: string | null
          rating: string | null
          rationale: string | null
          reviewed_at: string | null
          rubric_id: string | null
          rubric_version: string | null
          score: number | null
          score_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "brand_current_owner"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "product_ownership_chain"
            referencedColumns: ["owner_company_id"]
          },
          {
            foreignKeyName: "company_scores_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      source_attributions: {
        Row: {
          attribution_text: string | null
          homepage_url: string | null
          key: string | null
          licence: string | null
          licence_url: string | null
          name: string | null
        }
        Insert: {
          attribution_text?: string | null
          homepage_url?: string | null
          key?: string | null
          licence?: string | null
          licence_url?: string | null
          name?: string | null
        }
        Update: {
          attribution_text?: string | null
          homepage_url?: string | null
          key?: string | null
          licence?: string | null
          licence_url?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_ping: { Args: never; Returns: boolean }
      delete_own_account: { Args: never; Returns: undefined }
      gtin_is_restricted: { Args: { value: string }; Returns: boolean }
      gtin_is_valid: { Args: { value: string }; Returns: boolean }
      gtin_normalize: { Args: { value: string }; Returns: string }
      normalize_match_text: { Args: { value: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
