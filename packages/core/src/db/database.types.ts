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
