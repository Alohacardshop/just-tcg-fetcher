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
      sync_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          message: string
          operation_id: string
          operation_type: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          operation_id: string
          operation_type: string
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          operation_id?: string
          operation_type?: string
          status?: string
        }
        Relationships: []
      }
      tcgcsv_categories: {
        Row: {
          category_group_id: number | null
          created_at: string
          display_name: string | null
          id: string
          modified_on: string | null
          name: string
          tcgcsv_category_id: number
          updated_at: string
        }
        Insert: {
          category_group_id?: number | null
          created_at?: string
          display_name?: string | null
          id?: string
          modified_on?: string | null
          name: string
          tcgcsv_category_id: number
          updated_at?: string
        }
        Update: {
          category_group_id?: number | null
          created_at?: string
          display_name?: string | null
          id?: string
          modified_on?: string | null
          name?: string
          tcgcsv_category_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      tcgcsv_groups: {
        Row: {
          abbreviation: string | null
          category_id: number
          created_at: string
          group_id: number
          id: string
          is_supplemental: boolean | null
          modified_on: string | null
          name: string
          published_on: string | null
          release_date: string | null
          sealed_product: boolean | null
          updated_at: string
          url_slug: string | null
        }
        Insert: {
          abbreviation?: string | null
          category_id: number
          created_at?: string
          group_id: number
          id?: string
          is_supplemental?: boolean | null
          modified_on?: string | null
          name: string
          published_on?: string | null
          release_date?: string | null
          sealed_product?: boolean | null
          updated_at?: string
          url_slug?: string | null
        }
        Update: {
          abbreviation?: string | null
          category_id?: number
          created_at?: string
          group_id?: number
          id?: string
          is_supplemental?: boolean | null
          modified_on?: string | null
          name?: string
          published_on?: string | null
          release_date?: string | null
          sealed_product?: boolean | null
          updated_at?: string
          url_slug?: string | null
        }
        Relationships: []
      }
      tcgcsv_jobs: {
        Row: {
          category_id: number
          created_at: string
          failed_group_ids: number[] | null
          finished_at: string | null
          id: string
          job_type: string
          last_updated: string
          metadata: Json | null
          started_at: string
          succeeded_group_ids: number[] | null
          total_groups: number
          updated_at: string
        }
        Insert: {
          category_id: number
          created_at?: string
          failed_group_ids?: number[] | null
          finished_at?: string | null
          id?: string
          job_type: string
          last_updated?: string
          metadata?: Json | null
          started_at?: string
          succeeded_group_ids?: number[] | null
          total_groups?: number
          updated_at?: string
        }
        Update: {
          category_id?: number
          created_at?: string
          failed_group_ids?: number[] | null
          finished_at?: string | null
          id?: string
          job_type?: string
          last_updated?: string
          metadata?: Json | null
          started_at?: string
          succeeded_group_ids?: number[] | null
          total_groups?: number
          updated_at?: string
        }
        Relationships: []
      }
      tcgcsv_products: {
        Row: {
          category_id: number
          clean_name: string
          created_at: string
          extended_data: Json | null
          group_id: number
          id: string
          name: string
          number: string | null
          product_id: number
          product_type: string | null
          rarity: string | null
          updated_at: string
          url_slug: string | null
        }
        Insert: {
          category_id: number
          clean_name: string
          created_at?: string
          extended_data?: Json | null
          group_id: number
          id?: string
          name: string
          number?: string | null
          product_id: number
          product_type?: string | null
          rarity?: string | null
          updated_at?: string
          url_slug?: string | null
        }
        Update: {
          category_id?: number
          clean_name?: string
          created_at?: string
          extended_data?: Json | null
          group_id?: number
          id?: string
          name?: string
          number?: string | null
          product_id?: number
          product_type?: string | null
          rarity?: string | null
          updated_at?: string
          url_slug?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      test_tcgcsv_url_direct: {
        Args: Record<PropertyKey, never>
        Returns: {
          first_100_chars: string
          headers: Json
          line_count: number
          response_size: number
          url: string
        }[]
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
