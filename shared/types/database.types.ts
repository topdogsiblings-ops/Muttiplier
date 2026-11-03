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
      angles: {
        Row: {
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
      body_template_products: {
        Row: {
          org_id: string
          body_template_id: string
          product_id: string
        }
        Insert: {
          org_id?: string
          body_template_id: string
          product_id: string
        }
        Update: {
          org_id?: string
          body_template_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_template_products_body_template_id_fkey"
            columns: ["body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_template_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      body_templates: {
        Row: {
          org_id: string
          angle_id: string | null
          archived: boolean
          beats: Json
          cast_channel_id: string | null
          created_at: string
          created_by: string | null
          est_seconds: number | null
          feature_id: string | null
          format_id: string
          id: string
          notes: string | null
          person_id: string | null
          product_id: string
          shoot_id: string | null
          source_url: string | null
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          org_id?: string
          angle_id?: string | null
          archived?: boolean
          beats?: Json
          cast_channel_id?: string | null
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          feature_id?: string | null
          format_id: string
          id?: string
          notes?: string | null
          person_id?: string | null
          product_id: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          org_id?: string
          angle_id?: string | null
          archived?: boolean
          beats?: Json
          cast_channel_id?: string | null
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          feature_id?: string | null
          format_id?: string
          id?: string
          notes?: string | null
          person_id?: string | null
          product_id?: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string | null
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
            foreignKeyName: "body_templates_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_templates_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_templates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_channels: {
        Row: {
          org_id: string
          brand_id: string
          channel_id: string
        }
        Insert: {
          org_id?: string
          brand_id: string
          channel_id: string
        }
        Update: {
          org_id?: string
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          org_id: string
          beat: string
          channel_id: string | null
          clips_filmed: number
          created_at: string
          created_by: string | null
          description: string
          feature_id: string | null
          format_id: string | null
          id: string
          shoot_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          beat: string
          channel_id?: string | null
          clips_filmed?: number
          created_at?: string
          created_by?: string | null
          description?: string
          feature_id?: string | null
          format_id?: string | null
          id?: string
          shoot_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          beat?: string
          channel_id?: string | null
          clips_filmed?: number
          created_at?: string
          created_by?: string | null
          description?: string
          feature_id?: string | null
          format_id?: string | null
          id?: string
          shoot_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_shots_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          org_id: string
          archived: boolean
          created_at: string
          created_by: string | null
          est_seconds: number | null
          id: string
          mode: string
          notes: string | null
          product_id: string | null
          script: string
          shoot_id: string | null
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          org_id?: string
          archived?: boolean
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          id?: string
          mode: string
          notes?: string | null
          product_id?: string | null
          script: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          org_id?: string
          archived?: boolean
          created_at?: string
          created_by?: string | null
          est_seconds?: number | null
          id?: string
          mode?: string
          notes?: string | null
          product_id?: string | null
          script?: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      dropbox_connection: {
        Row: {
          org_id: string
          account_email: string | null
          account_id: string
          account_name: string | null
          created_at: string
          created_by: string | null
          id: string
          refresh_token_enc: string
          root: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          account_email?: string | null
          account_id: string
          account_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          refresh_token_enc: string
          root?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          account_email?: string | null
          account_id?: string
          account_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          refresh_token_enc?: string
          root?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dropbox_connection_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      formats: {
        Row: {
          org_id: string
          archived: boolean
          beat_broll: Json
          beat_display: Json
          beat_descriptions: Json
          beat_examples: Json
          beats: string[]
          code: string
          created_at: string
          created_by: string | null
          cta_modes: string[]
          description: string | null
          id: string
          kind: string
          name: string
          source_url: string | null
          target_seconds: number | null
          updated_at: string
        }
        Insert: {
          org_id?: string
          archived?: boolean
          beat_broll?: Json
          beat_display?: Json
          beat_descriptions?: Json
          beat_examples?: Json
          beats?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          cta_modes?: string[]
          description?: string | null
          id?: string
          kind?: string
          name: string
          source_url?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Update: {
          org_id?: string
          archived?: boolean
          beat_broll?: Json
          beat_display?: Json
          beat_descriptions?: Json
          beat_examples?: Json
          beats?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          cta_modes?: string[]
          description?: string | null
          id?: string
          kind?: string
          name?: string
          source_url?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      hook_templates: {
        Row: {
          org_id: string
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
          product_id: string | null
          script: string
          shoot_id: string | null
          source_url: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          org_id?: string
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
          product_id?: string | null
          script: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          org_id?: string
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
          product_id?: string | null
          script?: string
          shoot_id?: string | null
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
          {
            foreignKeyName: "hook_templates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_templates_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          org_id: string
          role: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          org_id?: string
          role?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          display_name: string | null
          org_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          org_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          org_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          next_shoot_number: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          next_shoot_number?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          next_shoot_number?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [

        ]
      }
      people: {
        Row: {
          user_id: string | null
          org_id: string
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          user_id?: string | null
          org_id?: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          user_id?: string | null
          org_id?: string
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
        ]      }
      person_channels: {
        Row: {
          org_id: string
          channel_id: string
          person_id: string
        }
        Insert: {
          org_id?: string
          channel_id: string
          person_id: string
        }
        Update: {
          org_id?: string
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
      product_features: {
        Row: {
          org_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          product_id: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          product_id: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          product_id?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          org_id: string
          brand_id: string
          claims_allowed: string | null
          claims_forbidden: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          brand_id: string
          claims_allowed?: string | null
          claims_forbidden?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          brand_id?: string
          claims_allowed?: string | null
          claims_forbidden?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
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
          active_org_id: string | null
          avatar_url: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active_org_id?: string | null
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active_org_id?: string | null
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
          org_id: string
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
          updated_at: string
          vo_max_share: number
          vo_min_share: number
          words_per_second: number
        }
        Insert: {
          org_id?: string
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
          updated_at?: string
          vo_max_share?: number
          vo_min_share?: number
          words_per_second?: number
        }
        Update: {
          org_id?: string
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
          updated_at?: string
          vo_max_share?: number
          vo_min_share?: number
          words_per_second?: number
        }
        Relationships: []
      }
      shoot_channels: {
        Row: {
          org_id: string
          channel_id: string
          shoot_id: string
        }
        Insert: {
          org_id?: string
          channel_id: string
          shoot_id: string
        }
        Update: {
          org_id?: string
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
      shoot_clips: {
        Row: {
          org_id: string
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          path: string | null
          shoot_id: string
          size: number
          state: string
          target: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          path?: string | null
          shoot_id: string
          size: number
          state?: string
          target: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          path?: string | null
          shoot_id?: string
          size?: number
          state?: string
          target?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_clips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_clips_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_formats: {
        Row: {
          org_id: string
          format_id: string
          shoot_id: string
        }
        Insert: {
          org_id?: string
          format_id: string
          shoot_id: string
        }
        Update: {
          org_id?: string
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
          org_id: string
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
          rating: string | null
          script_override: Json | null
          script_snapshot: Json
          shoot_id: string
          sort_order: number
          status: string
          take_notes: string | null
          updated_at: string
        }
        Insert: {
          org_id?: string
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
          rating?: string | null
          script_override?: Json | null
          script_snapshot: Json
          shoot_id: string
          sort_order?: number
          status?: string
          take_notes?: string | null
          updated_at?: string
        }
        Update: {
          org_id?: string
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
          rating?: string | null
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
      batch_scores: {
        Row: {
          org_id: string
          created_at: string
          created_by: string | null
          element_key: string
          element_kind: string
          notes: string | null
          score: string
          shortlist_id: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          element_key: string
          element_kind: string
          notes?: string | null
          score: string
          shortlist_id: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          element_key?: string
          element_kind?: string
          notes?: string | null
          score?: string
          shortlist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_scores_shortlist_id_fkey"
            columns: ["shortlist_id"]
            isOneToOne: false
            referencedRelation: "shoot_shortlists"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_element_overrides: {
        Row: {
          org_id: string
          created_at: string
          created_by: string | null
          dropped: boolean
          element_key: string
          element_kind: string
          shoot_id: string
        }
        Insert: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          dropped: boolean
          element_key: string
          element_kind: string
          shoot_id: string
        }
        Update: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          dropped?: boolean
          element_key?: string
          element_kind?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_element_overrides_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_manifests: {
        Row: {
          org_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          shoot_id: string
          updated_at: string
          version: number
        }
        Insert: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          data: Json
          id?: string
          shoot_id: string
          updated_at?: string
          version: number
        }
        Update: {
          org_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          shoot_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "shoot_manifests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_manifests_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_people: {
        Row: {
          org_id: string
          person_id: string
          shoot_id: string
        }
        Insert: {
          org_id?: string
          person_id: string
          shoot_id: string
        }
        Update: {
          org_id?: string
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
      shoot_shortlists: {
        Row: {
          org_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          entry_ids: string[]
          exploit_share: number | null
          manifest_version: number | null
          shoot_id: string
          size: number
          status: string
          status_at: string
          updated_at: string
        }
        Insert: {
          org_id?: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          entry_ids: string[]
          exploit_share?: number | null
          manifest_version?: number | null
          shoot_id: string
          size: number
          status?: string
          status_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          entry_ids?: string[]
          exploit_share?: number | null
          manifest_version?: number | null
          shoot_id?: string
          size?: number
          status?: string
          status_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_shortlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_shortlists_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["id"]
          },
        ]
      }
      shoots: {
        Row: {
          org_id: string
          broll_variations: number
          code: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          ended_by: string | null
          exploit_share: number
          hook_allocation: string
          id: string
          kit: string
          location_notes: string | null
          notes: string | null
          product_id: string
          reverted_at: string | null
          runway_target: number
          shoot_date: string | null
          slot_values: Json
          stale_at: string | null
          stale_by: string | null
          started_at: string | null
          started_by: string | null
          status: string
          submission_rate: number
          updated_at: string
          upload_requested_at: string | null
          upload_requested_by: string | null
          vo_variations: number
          wording_variations: number
        }
        Insert: {
          org_id?: string
          broll_variations?: number
          code?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          exploit_share?: number
          hook_allocation?: string
          id?: string
          kit?: string
          location_notes?: string | null
          notes?: string | null
          product_id: string
          reverted_at?: string | null
          runway_target?: number
          shoot_date?: string | null
          slot_values?: Json
          stale_at?: string | null
          stale_by?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          submission_rate?: number
          updated_at?: string
          upload_requested_at?: string | null
          upload_requested_by?: string | null
          vo_variations?: number
          wording_variations?: number
        }
        Update: {
          org_id?: string
          broll_variations?: number
          code?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          exploit_share?: number
          hook_allocation?: string
          id?: string
          kit?: string
          location_notes?: string | null
          notes?: string | null
          product_id?: string
          reverted_at?: string | null
          runway_target?: number
          shoot_date?: string | null
          slot_values?: Json
          stale_at?: string | null
          stale_by?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          submission_rate?: number
          updated_at?: string
          upload_requested_at?: string | null
          upload_requested_by?: string | null
          vo_variations?: number
          wording_variations?: number
        }
        Relationships: [
          {
            foreignKeyName: "shoots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoots_upload_requested_by_fkey"
            columns: ["upload_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          org_id: string
          active: boolean
          archived: boolean
          component: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          name: string
          needs: string[]
          parts: string[]
          placement: string
          settings: Json
          sort_order: number
          source_url: string | null
          system: boolean
          updated_at: string
        }
        Insert: {
          org_id?: string
          active?: boolean
          archived?: boolean
          component: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          name: string
          needs?: string[]
          parts?: string[]
          placement: string
          settings?: Json
          sort_order?: number
          source_url?: string | null
          system?: boolean
          updated_at?: string
        }
        Update: {
          org_id?: string
          active?: boolean
          archived?: boolean
          component?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          name?: string
          needs?: string[]
          parts?: string[]
          placement?: string
          settings?: Json
          sort_order?: number
          source_url?: string | null
          system?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      vo_cast: {
        Row: {
          org_id: string
          body_template_id: string
          created_at: string
          person_id: string
        }
        Insert: {
          org_id?: string
          body_template_id: string
          created_at?: string
          person_id: string
        }
        Update: {
          org_id?: string
          body_template_id?: string
          created_at?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vo_cast_body_template_id_fkey"
            columns: ["body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vo_cast_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      vo_cta_links: {
        Row: {
          org_id: string
          body_template_id: string
          created_at: string
          cta_template_id: string
        }
        Insert: {
          org_id?: string
          body_template_id: string
          created_at?: string
          cta_template_id: string
        }
        Update: {
          org_id?: string
          body_template_id?: string
          created_at?: string
          cta_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vo_cta_links_body_template_id_fkey"
            columns: ["body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vo_cta_links_cta_template_id_fkey"
            columns: ["cta_template_id"]
            isOneToOne: false
            referencedRelation: "cta_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      vo_hook_links: {
        Row: {
          org_id: string
          body_template_id: string
          created_at: string
          hook_template_id: string
        }
        Insert: {
          org_id?: string
          body_template_id: string
          created_at?: string
          hook_template_id: string
        }
        Update: {
          org_id?: string
          body_template_id?: string
          created_at?: string
          hook_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vo_hook_links_body_template_id_fkey"
            columns: ["body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vo_hook_links_hook_template_id_fkey"
            columns: ["hook_template_id"]
            isOneToOne: false
            referencedRelation: "hook_templates"
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
      create_org: { Args: { p_name: string; p_slug: string }; Returns: string }
      my_orgs: {
        Args: never
        Returns: {
          display_name: string | null
          has_chosen: boolean
          id: string
          is_current: boolean
          name: string
          role: string
          slug: string
        }[]
      }
      org_signup_open: { Args: never; Returns: boolean }
      set_active_org: { Args: { p_org_id: string }; Returns: undefined }
      renumber_shoot_items: { Args: { p_shoot_id: string }; Returns: undefined }
      revert_shoot: { Args: { p_shoot_id: string }; Returns: undefined }
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
