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
          archived: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "angles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_scores: {
        Row: {
          created_at: string
          created_by: string | null
          element_key: string
          element_kind: string
          notes: string | null
          org_id: string
          score: string
          shortlist_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          element_key: string
          element_kind: string
          notes?: string | null
          org_id?: string
          score: string
          shortlist_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          element_key?: string
          element_kind?: string
          notes?: string | null
          org_id?: string
          score?: string
          shortlist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_scores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_scores_shortlist_id_fkey"
            columns: ["org_id", "shortlist_id"]
            isOneToOne: false
            referencedRelation: "shoot_shortlists"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      body_template_products: {
        Row: {
          body_template_id: string
          org_id: string
          product_id: string
        }
        Insert: {
          body_template_id: string
          org_id?: string
          product_id: string
        }
        Update: {
          body_template_id?: string
          org_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_template_products_body_template_id_fkey"
            columns: ["org_id", "body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_template_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_template_products_product_id_fkey"
            columns: ["org_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      body_templates: {
        Row: {
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
          org_id: string
          person_id: string | null
          product_id: string
          shoot_id: string | null
          source_url: string | null
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
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
          org_id?: string
          person_id?: string | null
          product_id: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
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
          org_id?: string
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
            columns: ["org_id", "angle_id"]
            isOneToOne: false
            referencedRelation: "angles"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_templates_cast_channel_id_fkey"
            columns: ["org_id", "cast_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_templates_feature_id_fkey"
            columns: ["org_id", "feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_templates_format_id_fkey"
            columns: ["org_id", "format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_templates_person_id_fkey"
            columns: ["org_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_templates_product_id_fkey"
            columns: ["org_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "body_templates_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      brand_channels: {
        Row: {
          brand_id: string
          channel_id: string
          org_id: string
        }
        Insert: {
          brand_id: string
          channel_id: string
          org_id?: string
        }
        Update: {
          brand_id?: string
          channel_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_channels_brand_id_fkey"
            columns: ["org_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "brand_channels_channel_id_fkey"
            columns: ["org_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "brand_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
        Relationships: [
          {
            foreignKeyName: "brands_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      broll_shots: {
        Row: {
          beat: string
          channel_id: string | null
          clips_filmed: number
          created_at: string
          created_by: string | null
          description: string
          feature_id: string | null
          format_id: string | null
          id: string
          org_id: string
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
          feature_id?: string | null
          format_id?: string | null
          id?: string
          org_id?: string
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
          feature_id?: string | null
          format_id?: string | null
          id?: string
          org_id?: string
          shoot_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broll_shots_channel_id_fkey"
            columns: ["org_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "broll_shots_feature_id_fkey"
            columns: ["org_id", "feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "broll_shots_format_id_fkey"
            columns: ["org_id", "format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "broll_shots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broll_shots_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
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
          org_id: string
          slot_values: Json
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
          org_id?: string
          slot_values?: Json
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
          org_id?: string
          slot_values?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_org_access: {
        Row: {
          client_id: string
          created_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_org_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connector_org_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
          product_id: string | null
          script: string
          shoot_id: string | null
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
          org_id?: string
          product_id?: string | null
          script: string
          shoot_id?: string | null
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
          org_id?: string
          product_id?: string | null
          script?: string
          shoot_id?: string | null
          source_url?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cta_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cta_templates_product_id_fkey"
            columns: ["org_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "cta_templates_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      dropbox_connection: {
        Row: {
          account_email: string | null
          account_id: string
          account_name: string | null
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          refresh_token_enc: string
          root: string
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          account_id: string
          account_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          refresh_token_enc: string
          root?: string
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          account_id?: string
          account_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
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
          {
            foreignKeyName: "dropbox_connection_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      formats: {
        Row: {
          archived: boolean
          beat_broll: Json
          beat_descriptions: Json
          beat_display: Json
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
          org_id: string
          source_url: string | null
          target_seconds: number | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          beat_broll?: Json
          beat_descriptions?: Json
          beat_display?: Json
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
          org_id?: string
          source_url?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          beat_broll?: Json
          beat_descriptions?: Json
          beat_display?: Json
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
          org_id?: string
          source_url?: string | null
          target_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
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
          notes: string | null
          org_id: string
          product_id: string | null
          script: string
          shoot_id: string | null
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
          notes?: string | null
          org_id?: string
          product_id?: string | null
          script: string
          shoot_id?: string | null
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
          notes?: string | null
          org_id?: string
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
            columns: ["org_id", "angle_id"]
            isOneToOne: false
            referencedRelation: "angles"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "hook_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_templates_product_id_fkey"
            columns: ["org_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "hook_templates_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      license_device_codes: {
        Row: {
          approved_at: string | null
          created_at: string
          device_code_hash: string
          expires_at: string
          id: string
          last_polled_at: string | null
          org_id: string | null
          status: string
          user_code: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          device_code_hash: string
          expires_at?: string
          id?: string
          last_polled_at?: string | null
          org_id?: string | null
          status?: string
          user_code: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          device_code_hash?: string
          expires_at?: string
          id?: string
          last_polled_at?: string | null
          org_id?: string | null
          status?: string
          user_code?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "license_device_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chat_reads: {
        Row: {
          last_read_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_chat_reads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_chat_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          channel_ids: string[]
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          emailed_at: string | null
          org_id: string
          role: string
        }
        Insert: {
          channel_ids?: string[]
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          emailed_at?: string | null
          org_id?: string
          role?: string
        }
        Update: {
          channel_ids?: string[]
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          emailed_at?: string | null
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      org_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          kind: string
          mentions: string[]
          org_id: string
          ref: Json | null
          reply_to: string | null
          via: string | null
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind: string
          mentions?: string[]
          org_id?: string
          ref?: Json | null
          reply_to?: string | null
          via?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          mentions?: string[]
          org_id?: string
          ref?: Json | null
          reply_to?: string | null
          via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "org_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          org_id: string
          price_id: string | null
          status: string | null
          stripe_customer_id: string
          stripe_subscription_id: string | null
          synced_at: string | null
          trial_end: string | null
          trial_used: boolean
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          org_id: string
          price_id?: string | null
          status?: string | null
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          synced_at?: string | null
          trial_end?: string | null
          trial_used?: boolean
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          org_id?: string
          price_id?: string | null
          status?: string | null
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          synced_at?: string | null
          trial_end?: string | null
          trial_used?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          billing_exempt: boolean
          created_at: string
          created_by: string | null
          id: string
          klip_payment_intent_id: string | null
          klip_purchased_at: string | null
          klip_signed_out_at: string | null
          logo_url: string | null
          name: string
          next_shoot_number: number
          slug: string
          updated_at: string
        }
        Insert: {
          billing_exempt?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          klip_payment_intent_id?: string | null
          klip_purchased_at?: string | null
          klip_signed_out_at?: string | null
          logo_url?: string | null
          name: string
          next_shoot_number?: number
          slug: string
          updated_at?: string
        }
        Update: {
          billing_exempt?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          klip_payment_intent_id?: string | null
          klip_purchased_at?: string | null
          klip_signed_out_at?: string | null
          logo_url?: string | null
          name?: string
          next_shoot_number?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orgs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id?: string
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_org_member_fkey"
            columns: ["org_id", "user_id"]
            isOneToOne: true
            referencedRelation: "org_members"
            referencedColumns: ["org_id", "user_id"]
          },
        ]
      }
      person_channels: {
        Row: {
          channel_id: string
          org_id: string
          person_id: string
        }
        Insert: {
          channel_id: string
          org_id?: string
          person_id: string
        }
        Update: {
          channel_id?: string
          org_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_channels_channel_id_fkey"
            columns: ["org_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "person_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_channels_person_id_fkey"
            columns: ["org_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      product_features: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          product_id: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id?: string
          product_id: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
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
            foreignKeyName: "product_features_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["org_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["org_id", "id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["org_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_org_id: string | null
          avatar_url: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          active_org_id?: string | null
          avatar_url?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          active_org_id?: string | null
          avatar_url?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_preamble: string | null
          channel_slots: Json
          chat_events: Json
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
          org_id: string
          org_profile: Json
          productive_hours_per_day: number
          script_rules: Json
          updated_at: string
          vo_max_share: number
          vo_min_share: number
          words_per_second: number
        }
        Insert: {
          ai_preamble?: string | null
          channel_slots?: Json
          chat_events?: Json
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
          org_id?: string
          org_profile?: Json
          productive_hours_per_day?: number
          script_rules?: Json
          updated_at?: string
          vo_max_share?: number
          vo_min_share?: number
          words_per_second?: number
        }
        Update: {
          ai_preamble?: string | null
          channel_slots?: Json
          chat_events?: Json
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
          org_id?: string
          org_profile?: Json
          productive_hours_per_day?: number
          script_rules?: Json
          updated_at?: string
          vo_max_share?: number
          vo_min_share?: number
          words_per_second?: number
        }
        Relationships: [
          {
            foreignKeyName: "settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      shoot_channels: {
        Row: {
          channel_id: string
          org_id: string
          shoot_id: string
        }
        Insert: {
          channel_id: string
          org_id?: string
          shoot_id: string
        }
        Update: {
          channel_id?: string
          org_id?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_channels_channel_id_fkey"
            columns: ["org_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_channels_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      shoot_clips: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          org_id: string
          path: string | null
          shoot_id: string
          size: number
          state: string
          target: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          org_id?: string
          path?: string | null
          shoot_id: string
          size: number
          state?: string
          target: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          org_id?: string
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
            foreignKeyName: "shoot_clips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_clips_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      shoot_element_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          dropped: boolean
          element_key: string
          element_kind: string
          org_id: string
          shoot_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dropped: boolean
          element_key: string
          element_kind: string
          org_id?: string
          shoot_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dropped?: boolean
          element_key?: string
          element_kind?: string
          org_id?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_element_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_element_overrides_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      shoot_formats: {
        Row: {
          format_id: string
          org_id: string
          shoot_id: string
        }
        Insert: {
          format_id: string
          org_id?: string
          shoot_id: string
        }
        Update: {
          format_id?: string
          org_id?: string
          shoot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoot_formats_format_id_fkey"
            columns: ["org_id", "format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_formats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_formats_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            columns: ["org_id", "body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_items_channel_id_fkey"
            columns: ["org_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_items_cta_template_id_fkey"
            columns: ["org_id", "cta_template_id"]
            isOneToOne: false
            referencedRelation: "cta_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_items_hook_template_id_fkey"
            columns: ["org_id", "hook_template_id"]
            isOneToOne: false
            referencedRelation: "hook_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_items_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
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
      shoot_manifests: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          org_id: string
          shoot_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: Json
          id?: string
          org_id?: string
          shoot_id: string
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          org_id?: string
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
            foreignKeyName: "shoot_manifests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_manifests_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
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
            foreignKeyName: "shoot_people_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_people_person_id_fkey"
            columns: ["org_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoot_people_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      shoot_shortlists: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          entry_ids: string[]
          exploit_share: number | null
          id: string
          manifest_version: number | null
          org_id: string
          shoot_id: string
          size: number
          status: string
          status_at: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          entry_ids: string[]
          exploit_share?: number | null
          id?: string
          manifest_version?: number | null
          org_id?: string
          shoot_id: string
          size: number
          status?: string
          status_at?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          entry_ids?: string[]
          exploit_share?: number | null
          id?: string
          manifest_version?: number | null
          org_id?: string
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
            foreignKeyName: "shoot_shortlists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoot_shortlists_shoot_id_fkey"
            columns: ["org_id", "shoot_id"]
            isOneToOne: false
            referencedRelation: "shoots"
            referencedColumns: ["org_id", "id"]
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
          exploit_share: number
          hook_allocation: string
          id: string
          kit: string
          location_notes: string | null
          notes: string | null
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "shoots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shoots_product_id_fkey"
            columns: ["org_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "shoots_stale_by_fkey"
            columns: ["stale_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          org_id: string
          parts: string[]
          placement: string
          settings: Json
          sort_order: number
          source_url: string | null
          system: boolean
          updated_at: string
        }
        Insert: {
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
          org_id?: string
          parts?: string[]
          placement: string
          settings?: Json
          sort_order?: number
          source_url?: string | null
          system?: boolean
          updated_at?: string
        }
        Update: {
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
          org_id?: string
          parts?: string[]
          placement?: string
          settings?: Json
          sort_order?: number
          source_url?: string | null
          system?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      vo_cast: {
        Row: {
          body_template_id: string
          created_at: string
          org_id: string
          person_id: string
        }
        Insert: {
          body_template_id: string
          created_at?: string
          org_id?: string
          person_id: string
        }
        Update: {
          body_template_id?: string
          created_at?: string
          org_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vo_cast_body_template_id_fkey"
            columns: ["org_id", "body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vo_cast_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vo_cast_person_id_fkey"
            columns: ["org_id", "person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      vo_cta_links: {
        Row: {
          body_template_id: string
          created_at: string
          cta_template_id: string
          org_id: string
        }
        Insert: {
          body_template_id: string
          created_at?: string
          cta_template_id: string
          org_id?: string
        }
        Update: {
          body_template_id?: string
          created_at?: string
          cta_template_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vo_cta_links_body_template_id_fkey"
            columns: ["org_id", "body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vo_cta_links_cta_template_id_fkey"
            columns: ["org_id", "cta_template_id"]
            isOneToOne: false
            referencedRelation: "cta_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vo_cta_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      vo_hook_links: {
        Row: {
          body_template_id: string
          created_at: string
          hook_template_id: string
          org_id: string
        }
        Insert: {
          body_template_id: string
          created_at?: string
          hook_template_id: string
          org_id?: string
        }
        Update: {
          body_template_id?: string
          created_at?: string
          hook_template_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vo_hook_links_body_template_id_fkey"
            columns: ["org_id", "body_template_id"]
            isOneToOne: false
            referencedRelation: "body_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vo_hook_links_hook_template_id_fkey"
            columns: ["org_id", "hook_template_id"]
            isOneToOne: false
            referencedRelation: "hook_templates"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "vo_hook_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
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
      chat_unread_count: { Args: never; Returns: number }
      create_org: {
        Args: { p_name: string; p_profile?: Json; p_slug: string }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      mark_chat_read: { Args: never; Returns: undefined }
      my_org_summaries: {
        Args: never
        Returns: {
          active_shoots: number
          admins: number
          billing_exempt: boolean
          brands: number
          cancel_at_period_end: boolean
          channels: number
          chat_unread: number
          ctas: number
          current_period_end: string
          draft_shoots: number
          faces: Json
          hooks: number
          invites: number
          last_shoot_at: string
          live_shoots: number
          members: number
          org_id: string
          products: number
          shoots_this_month: number
          subscription_status: string
          trial_end: string
        }[]
      }
      my_orgs: {
        Args: never
        Returns: {
          display_name: string
          entitled: boolean
          has_chosen: boolean
          id: string
          is_current: boolean
          klip_access: string
          logo_url: string
          name: string
          role: string
          slug: string
        }[]
      }
      org_license_state: {
        Args: { p_org_id: string }
        Returns: {
          can_use_klip: boolean
          entitled: boolean
          klip_access: string
          trial_end: string
        }[]
      }
      org_signup_open: { Args: never; Returns: boolean }
      post_ai_drafts_event: {
        Args: { p_count: number; p_kind: string }
        Returns: undefined
      }
      renumber_shoot_items: { Args: { p_shoot_id: string }; Returns: undefined }
      revert_shoot: { Args: { p_shoot_id: string }; Returns: undefined }
      set_active_org: { Args: { p_org_id: string }; Returns: undefined }
      set_channel_members: {
        Args: { p_channel_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      set_connector_orgs: {
        Args: { p_client_id: string; p_org_ids: string[] }
        Returns: undefined
      }
      sign_out_klip_everywhere: { Args: never; Returns: string }
      update_my_profile: {
        Args: { p_display_name: string; p_photo_url: string }
        Returns: undefined
      }
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
