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
      allowed_users: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          id?: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      angles: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      body_templates: {
        Row: {
          angle_id: string | null
          archived: boolean
          beats: Json
          created_at: string
          created_by: string | null
          est_seconds: number | null
          format_id: string
          id: string
          notes: string | null
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          angle_id?: string | null
          archived?: boolean
          beats?: Json
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          format_id: string
          id?: string
          notes?: string | null
          source_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          angle_id?: string | null
          archived?: boolean
          beats?: Json
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          format_id?: string
          id?: string
          notes?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_templates_angle_id_fkey"
            columns: ["angle_id"]
            isOneToOne: false
            referencedRelation: "angles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_templates_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_channels: {
        Row: {
          brand_id: string
          channel_id: string
        }
        Insert: {
          brand_id: string
          channel_id: string
        }
        Update: {
          brand_id?: string
          channel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_channels_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          commission_pct: number | null
          created_at: string
          created_by: string | null
          currency: string
          flat_fee: number | null
          id: string
          name: string
          notes: string | null
          pay_model: string | null
          slug: string
          status: string
          trybe_brand_id: string | null
          trybe_data: Json | null
          trybe_score: number | null
          trybe_url: string | null
          updated_at: string
          videos_required: number | null
        }
        Insert: {
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          flat_fee?: number | null
          id?: string
          name: string
          notes?: string | null
          pay_model?: string | null
          slug: string
          status?: string
          trybe_brand_id?: string | null
          trybe_data?: Json | null
          trybe_score?: number | null
          trybe_url?: string | null
          updated_at?: string
          videos_required?: number | null
        }
        Update: {
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          flat_fee?: number | null
          id?: string
          name?: string
          notes?: string | null
          pay_model?: string | null
          slug?: string
          status?: string
          trybe_brand_id?: string | null
          trybe_data?: Json | null
          trybe_score?: number | null
          trybe_url?: string | null
          updated_at?: string
          videos_required?: number | null
        }
        Relationships: []
      }
      broll_shots: {
        Row: {
          beat: string
          channel_id: string | null
          clips_filmed: number
          created_at: string
          created_by: string | null
          description: string
          format_id: string | null
          id: string
          min_clips: number
          product_visible: boolean
          shoot_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          beat: string
          channel_id?: string | null
          clips_filmed?: number
          created_at?: string
          created_by?: string | null
          description?: string
          format_id?: string | null
          id?: string
          min_clips?: number
          product_visible?: boolean
          shoot_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          beat?: string
          channel_id?: string | null
          clips_filmed?: number
          created_at?: string
          created_by?: string | null
          description?: string
          format_id?: string | null
          id?: string
          min_clips?: number
          product_visible?: boolean
          shoot_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_shots_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_shots_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_shots_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          dog_phrase: string
          dogs: string[]
          folder_slug: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          dog_phrase?: string
          dogs?: string[]
          folder_slug: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          dog_phrase?: string
          dogs?: string[]
          folder_slug?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      cta_templates: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          est_seconds: number | null
          id: string
          mode: string
          notes: string | null
          script: string
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          id?: string
          mode: string
          notes?: string | null
          script: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          id?: string
          mode?: string
          notes?: string | null
          script?: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      formats: {
        Row: {
          archived: boolean
          beat_broll: Json
          beat_descriptions: Json
          beats: string[]
          code: string
          created_at: string
          created_by: string | null
          cta_modes: string[]
          description: string | null
          id: string
          name: string
          source_url: string | null
          target_seconds: number | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          beat_broll?: Json
          beat_descriptions?: Json
          beats?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          cta_modes?: string[]
          description?: string | null
          id?: string
          name: string
          source_url?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          beat_broll?: Json
          beat_descriptions?: Json
          beats?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          cta_modes?: string[]
          description?: string | null
          id?: string
          name?: string
          source_url?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      hook_templates: {
        Row: {
          angle_id: string | null
          archived: boolean
          caption: string | null
          created_at: string
          created_by: string | null
          est_seconds: number | null
          filming_notes: string | null
          id: string
          is_universal: boolean
          notes: string | null
          script: string
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          angle_id?: string | null
          archived?: boolean
          caption?: string | null
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          filming_notes?: string | null
          id?: string
          is_universal?: boolean
          notes?: string | null
          script: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          angle_id?: string | null
          archived?: boolean
          caption?: string | null
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          filming_notes?: string | null
          id?: string
          is_universal?: boolean
          notes?: string | null
          script?: string
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hook_templates_angle_id_fkey"
            columns: ["angle_id"]
            isOneToOne: false
            referencedRelation: "angles"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          active: boolean
          allowed_user_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_user_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_allowed_user_id_fkey"
            columns: ["allowed_user_id"]
            isOneToOne: true
            referencedRelation: "allowed_users"
            referencedColumns: ["id"]
          },
        ]      }
      person_channels: {
        Row: {
          channel_id: string
          person_id: string
        }
        Insert: {
          channel_id: string
          person_id: string
        }
        Update: {
          channel_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_channels_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string
          claims_allowed: string | null
          claims_forbidden: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          slot_values: Json
          slug: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          claims_allowed?: string | null
          claims_forbidden?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          slot_values?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          claims_allowed?: string | null
          claims_forbidden?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          slot_values?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          clip_aspect_height: number
          clip_aspect_width: number
          clip_max_fps: number
          clip_min_fps: number
          clip_min_height: number
          clip_min_width: number
          created_at: string
          created_by: string | null
          default_submission_rate: number
          general_broll: Json
          id: string
          minutes_per_cta_sync: number
          minutes_per_cta_vo: number
          minutes_per_hook: number
          minutes_per_vo: number
          productive_hours_per_day: number
          singleton: boolean
          updated_at: string
          vo_max_share: number
          vo_min_share: number
          words_per_second: number
        }
        Insert: {
          clip_aspect_height?: number
          clip_aspect_width?: number
          clip_max_fps?: number
          clip_min_fps?: number
          clip_min_height?: number
          clip_min_width?: number
          created_at?: string
          created_by?: string | null
          default_submission_rate?: number
          general_broll?: Json
          id?: string
          minutes_per_cta_sync?: number
          minutes_per_cta_vo?: number
          minutes_per_hook?: number
          minutes_per_vo?: number
          productive_hours_per_day?: number
          singleton?: boolean
          updated_at?: string
          vo_max_share?: number
          vo_min_share?: number
          words_per_second?: number
        }
        Update: {
          clip_aspect_height?: number
          clip_aspect_width?: number
          clip_max_fps?: number
          clip_min_fps?: number
          clip_min_height?: number
          clip_min_width?: number
          created_at?: string
          created_by?: string | null
          default_submission_rate?: number
          general_broll?: Json
          id?: string
          minutes_per_cta_sync?: number
          minutes_per_cta_vo?: number
          minutes_per_hook?: number
          minutes_per_vo?: number
          productive_hours_per_day?: number
          singleton?: boolean
          updated_at?: string
          vo_max_share?: number
          vo_min_share?: number
          words_per_second?: number
        }
        Relationships: []
      }
      shoot_channels: {
        Row: {
          channel_id: string
          shoot_id: string
        }
        Insert: {
          channel_id: string
          shoot_id: string
        }
        Update: {
          channel_id?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_channels_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_channels_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_formats: {
        Row: {
          format_id: string
          shoot_id: string
        }
        Insert: {
          format_id: string
          shoot_id: string
        }
        Update: {
          format_id?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_formats_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_formats_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_items: {
        Row: {
          body_template_id: string | null
          caption: string | null
          channel_id: string | null
          code: string
          created_at: string
          created_by: string | null
          cta_mode: string | null
          cta_template_id: string | null
          hook_template_id: string | null
          id: string
          kind: string
          location: string | null
          person_id: string
          script_override: Json | null
          script_snapshot: Json
          shoot_id: string
          sort_order: number
          status: string
          take_notes: string | null
          updated_at: string
        }
        Insert: {
          body_template_id?: string | null
          caption?: string | null
          channel_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          cta_mode?: string | null
          cta_template_id?: string | null
          hook_template_id?: string | null
          id?: string
          kind: string
          location?: string | null
          person_id: string
          script_override?: Json | null
          script_snapshot: Json
          shoot_id: string
          sort_order?: number
          status?: string
          take_notes?: string | null
          updated_at?: string
        }
        Update: {
          body_template_id?: string | null
          caption?: string | null
          channel_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          cta_mode?: string | null
          cta_template_id?: string | null
          hook_template_id?: string | null
          id?: string
          kind?: string
          location?: string | null
          person_id?: string
          script_override?: Json | null
          script_snapshot?: Json
          shoot_id?: string
          sort_order?: number
          status?: string
          take_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_items_body_template_id_fkey"
            columns: ["body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_items_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_items_cta_template_id_fkey"
            columns: ["cta_template_id"]
            isOneToOne: false
            referencedRelation: "cta_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_items_hook_template_id_fkey"
            columns: ["hook_template_id"]
            isOneToOne: false
            referencedRelation: "hook_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_items_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_items_shoot_id_person_id_fkey"
            columns: ["shoot_id", "person_id"]
            isOneToOne: false
            referencedRelation: "shoot_people"
            referencedColumns: ["shoot_id", "person_id"]
          },
        ]
      }
      shoot_people: {
        Row: {
          person_id: string
          shoot_id: string
        }
        Insert: {
          person_id: string
          shoot_id: string
        }
        Update: {
          person_id?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_people_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoots: {
        Row: {
          broll_variations: number
          code: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          ended_by: string | null
          hook_allocation: string
          id: string
          kit: string
          location_notes: string | null
          notes: string | null
          product_id: string
          runway_target: number
          shoot_date: string | null
          started_at: string | null
          started_by: string | null
          status: string
          submission_rate: number
          updated_at: string
        }
        Insert: {
          broll_variations?: number
          code?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          hook_allocation?: string
          id?: string
          kit?: string
          location_notes?: string | null
          notes?: string | null
          product_id: string
          runway_target?: number
          shoot_date?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          submission_rate?: number
          updated_at?: string
        }
        Update: {
          broll_variations?: number
          code?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          hook_allocation?: string
          id?: string
          kit?: string
          location_notes?: string | null
          notes?: string | null
          product_id?: string
          runway_target?: number
          shoot_date?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          submission_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      template_usage: {
        Row: {
          kind: string | null
          shoot_count: number | null
          template_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      renumber_shoot_items: { Args: { p_shoot_id: string }; Returns: undefined }
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
