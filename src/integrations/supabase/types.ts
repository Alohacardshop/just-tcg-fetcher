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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      automation_settings: {
        Row: {
          created_at: string
          enabled: boolean
          game_id: string
          id: string
          last_run_at: string | null
          schedule_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          game_id: string
          id?: string
          last_run_at?: string | null
          schedule_time?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          game_id?: string
          id?: string
          last_run_at?: string | null
          schedule_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      card_prices: {
        Row: {
          card_id: string
          condition: string | null
          created_at: string
          currency: string
          fetched_at: string
          high_price: number | null
          id: string
          low_price: number | null
          market_price: number | null
          source: string
          updated_at: string
          variant: string | null
        }
        Insert: {
          card_id: string
          condition?: string | null
          created_at?: string
          currency?: string
          fetched_at?: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          market_price?: number | null
          source?: string
          updated_at?: string
          variant?: string | null
        }
        Update: {
          card_id?: string
          condition?: string | null
          created_at?: string
          currency?: string
          fetched_at?: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          market_price?: number | null
          source?: string
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_prices_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_prices_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "combined_cards"
            referencedColumns: ["card_id"]
          },
        ]
      }
      card_product_links: {
        Row: {
          card_id: string
          created_at: string
          id: string
          match_confidence: number | null
          match_method: string | null
          tcgcsv_product_id: string
          updated_at: string
          verified: boolean | null
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          tcgcsv_product_id: string
          updated_at?: string
          verified?: boolean | null
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          tcgcsv_product_id?: string
          updated_at?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          created_at: string
          data: Json | null
          game_id: string
          id: string
          image_url: string | null
          jt_card_id: string
          name: string
          number: string | null
          product_url: string | null
          rarity: string | null
          set_id: string
          tcgcsv_match_confidence: number | null
          tcgcsv_match_method: string | null
          tcgplayer_product_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          game_id: string
          id?: string
          image_url?: string | null
          jt_card_id: string
          name: string
          number?: string | null
          product_url?: string | null
          rarity?: string | null
          set_id: string
          tcgcsv_match_confidence?: number | null
          tcgcsv_match_method?: string | null
          tcgplayer_product_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          game_id?: string
          id?: string
          image_url?: string | null
          jt_card_id?: string
          name?: string
          number?: string | null
          product_url?: string | null
          rarity?: string | null
          set_id?: string
          tcgcsv_match_confidence?: number | null
          tcgcsv_match_method?: string | null
          tcgplayer_product_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          cards_count: number | null
          created_at: string
          id: string
          jt_game_id: string
          last_synced_at: string | null
          name: string
          sets_count: number | null
          slug: string | null
          tcgcsv_category_id: string | null
          updated_at: string
        }
        Insert: {
          cards_count?: number | null
          created_at?: string
          id?: string
          jt_game_id: string
          last_synced_at?: string | null
          name: string
          sets_count?: number | null
          slug?: string | null
          tcgcsv_category_id?: string | null
          updated_at?: string
        }
        Update: {
          cards_count?: number | null
          created_at?: string
          id?: string
          jt_game_id?: string
          last_synced_at?: string | null
          name?: string
          sets_count?: number | null
          slug?: string | null
          tcgcsv_category_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_admin: boolean | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      sealed_prices: {
        Row: {
          condition: string | null
          created_at: string
          currency: string
          fetched_at: string
          high_price: number | null
          id: string
          low_price: number | null
          market_price: number | null
          product_id: string
          source: string
          updated_at: string
          variant: string | null
        }
        Insert: {
          condition?: string | null
          created_at?: string
          currency?: string
          fetched_at?: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          market_price?: number | null
          product_id: string
          source?: string
          updated_at?: string
          variant?: string | null
        }
        Update: {
          condition?: string | null
          created_at?: string
          currency?: string
          fetched_at?: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          market_price?: number | null
          product_id?: string
          source?: string
          updated_at?: string
          variant?: string | null
        }
        Relationships: []
      }
      sealed_products: {
        Row: {
          created_at: string
          data: Json | null
          game_id: string
          id: string
          image_url: string | null
          jt_product_id: string
          name: string
          product_type: string | null
          set_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          game_id: string
          id?: string
          image_url?: string | null
          jt_product_id: string
          name: string
          product_type?: string | null
          set_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          game_id?: string
          id?: string
          image_url?: string | null
          jt_product_id?: string
          name?: string
          product_type?: string | null
          set_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sets: {
        Row: {
          cards_synced_count: number
          code: string | null
          created_at: string
          game_id: string
          id: string
          jt_set_id: string
          last_sync_error: string | null
          last_synced_at: string | null
          name: string
          partial_sync_data: Json | null
          release_date: string | null
          resume_token: string | null
          sealed_synced_count: number
          sync_status: string
          tcgcsv_group_id: string | null
          total_cards: number | null
          updated_at: string
        }
        Insert: {
          cards_synced_count?: number
          code?: string | null
          created_at?: string
          game_id: string
          id?: string
          jt_set_id: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          name: string
          partial_sync_data?: Json | null
          release_date?: string | null
          resume_token?: string | null
          sealed_synced_count?: number
          sync_status?: string
          tcgcsv_group_id?: string | null
          total_cards?: number | null
          updated_at?: string
        }
        Update: {
          cards_synced_count?: number
          code?: string | null
          created_at?: string
          game_id?: string
          id?: string
          jt_set_id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          name?: string
          partial_sync_data?: Json | null
          release_date?: string | null
          resume_token?: string | null
          sealed_synced_count?: number
          sync_status?: string
          tcgcsv_group_id?: string | null
          total_cards?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_control: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          operation_id: string
          operation_type: string
          should_cancel: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          operation_id: string
          operation_type: string
          should_cancel?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          operation_id?: string
          operation_type?: string
          should_cancel?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          created_by: string | null
          details: Json | null
          duration_ms: number | null
          error_count: number | null
          game_id: string | null
          id: string
          message: string
          operation_id: string
          operation_type: string
          progress_current: number | null
          progress_total: number | null
          set_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_count?: number | null
          game_id?: string | null
          id?: string
          message: string
          operation_id: string
          operation_type: string
          progress_current?: number | null
          progress_total?: number | null
          set_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: Json | null
          duration_ms?: number | null
          error_count?: number | null
          game_id?: string | null
          id?: string
          message?: string
          operation_id?: string
          operation_type?: string
          progress_current?: number | null
          progress_total?: number | null
          set_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_logs_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_status: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          game_id: string | null
          id: string
          operation_id: string
          operation_type: string
          progress_current: number | null
          progress_total: number | null
          resume_data: Json | null
          set_id: string | null
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          game_id?: string | null
          id?: string
          operation_id: string
          operation_type: string
          progress_current?: number | null
          progress_total?: number | null
          resume_data?: Json | null
          set_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          game_id?: string | null
          id?: string
          operation_id?: string
          operation_type?: string
          progress_current?: number | null
          progress_total?: number | null
          resume_data?: Json | null
          set_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tcgcsv_categories: {
        Row: {
          category_id: string
          created_at: string
          data: Json | null
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          data?: Json | null
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          data?: Json | null
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tcgcsv_groups: {
        Row: {
          category_id: string
          created_at: string
          data: Json | null
          game_id: string
          group_id: string
          name: string
          release_date: string | null
          slug: string | null
          tcgcsv_category_id: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          data?: Json | null
          game_id: string
          group_id: string
          name: string
          release_date?: string | null
          slug?: string | null
          tcgcsv_category_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          data?: Json | null
          game_id?: string
          group_id?: string
          name?: string
          release_date?: string | null
          slug?: string | null
          tcgcsv_category_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tcgcsv_products: {
        Row: {
          category_id: string
          created_at: string
          data: Json | null
          game_id: string
          group_id: string
          image_url: string | null
          name: string
          number: string | null
          product_id: string
          tcgcsv_group_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          data?: Json | null
          game_id: string
          group_id: string
          image_url?: string | null
          name: string
          number?: string | null
          product_id: string
          tcgcsv_group_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          data?: Json | null
          game_id?: string
          group_id?: string
          image_url?: string | null
          name?: string
          number?: string | null
          product_id?: string
          tcgcsv_group_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      combined_cards: {
        Row: {
          card_id: string | null
          card_image_url: string | null
          card_name: string | null
          card_number: string | null
          game_name: string | null
          match_confidence: number | null
          match_method: string | null
          match_verified: boolean | null
          rarity: string | null
          set_name: string | null
          tcgcsv_image_url: string | null
          tcgcsv_product_name: string | null
          tcgcsv_url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      refresh_combined_cards: {
        Args: Record<PropertyKey, never>
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
