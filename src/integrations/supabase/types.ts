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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      coordinators: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          org: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          org?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          org?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_workers: {
        Row: {
          active: boolean
          area: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          area?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          area?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      families: {
        Row: {
          address: string
          contact_phone: string | null
          coordinator_id: string
          created_at: string
          id: string
          is_sensitive: boolean
          lat: number | null
          lng: number | null
          name: string
          neighborhood: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          address: string
          contact_phone?: string | null
          coordinator_id?: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          contact_phone?: string | null
          coordinator_id?: string
          created_at?: string
          id?: string
          is_sensitive?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      food_sources: {
        Row: {
          active: boolean
          address: string
          area: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          address: string
          area?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          address?: string
          area?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_notes: {
        Row: {
          coordinator_id: string
          created_at: string
          id: string
          note: string
          post_id: string
          updated_at: string
        }
        Insert: {
          coordinator_id?: string
          created_at?: string
          id?: string
          note: string
          post_id: string
          updated_at?: string
        }
        Update: {
          coordinator_id?: string
          created_at?: string
          id?: string
          note?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_notes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "surplus_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      surplus_posts: {
        Row: {
          area: string | null
          assigned_at: string | null
          claim_mode: string | null
          coordinator_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_area: string | null
          delivery_destination: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          family_id: string | null
          food_description: string
          id: string
          is_confidential: boolean
          picked_up_at: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_location: string
          quantity: string
          ready_time: string
          restaurant_name: string
          source_id: string | null
          status: string
          worker_id: string | null
        }
        Insert: {
          area?: string | null
          assigned_at?: string | null
          claim_mode?: string | null
          coordinator_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_area?: string | null
          delivery_destination?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          family_id?: string | null
          food_description: string
          id?: string
          is_confidential?: boolean
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_location: string
          quantity: string
          ready_time: string
          restaurant_name: string
          source_id?: string | null
          status?: string
          worker_id?: string | null
        }
        Update: {
          area?: string | null
          assigned_at?: string | null
          claim_mode?: string | null
          coordinator_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_area?: string | null
          delivery_destination?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          family_id?: string | null
          food_description?: string
          id?: string
          is_confidential?: boolean
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_location?: string
          quantity?: string
          ready_time?: string
          restaurant_name?: string
          source_id?: string | null
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surplus_posts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_posts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "food_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_posts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "delivery_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_account: { Args: { _user_id: string }; Returns: undefined }
      complete_registration: {
        Args: { _profile: Json }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      coordinator_dispatch: {
        Args: {
          _family_id: string
          _meeting_point?: string
          _mode: string
          _post_id: string
          _worker_id?: string
        }
        Returns: undefined
      }
      create_profile: {
        Args: {
          _fallback_name: string
          _meta: Json
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      create_surplus_post: {
        Args: {
          _food_description: string
          _pickup_location: string
          _quantity: string
          _ready_time: string
        }
        Returns: string
      }
      deactivate_account: { Args: { _user_id: string }; Returns: undefined }
      distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_accounts: {
        Args: never
        Returns: {
          active: boolean
          address: string
          approved: boolean
          area: string
          created_at: string
          deactivated_at: string
          deactivated_by_self: boolean
          email: string
          name: string
          open_tasks: number
          org: string
          phone: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
          source_type: Database["public"]["Enums"]["source_type"]
          user_id: string
        }[]
      }
      my_account: {
        Args: never
        Returns: {
          active: boolean
          approved: boolean
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      my_source_posts: {
        Args: never
        Returns: {
          assigned_at: string
          created_at: string
          delivered_at: string
          food_description: string
          id: string
          picked_up_at: string
          pickup_location: string
          quantity: string
          ready_time: string
          status: string
        }[]
      }
      open_task_count: { Args: { _user_id: string }; Returns: number }
      promote_to_coordinator: { Args: { _user_id: string }; Returns: undefined }
      reactivate_account: { Args: { _user_id: string }; Returns: undefined }
      recent_self_deactivations: {
        Args: never
        Returns: {
          deactivated_at: string
          email: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      register_user: {
        Args: {
          _email: string
          _meta: Json
          _pre_approved: boolean
          _user_id: string
        }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      same_area: { Args: { a: string; b: string }; Returns: boolean }
      set_account_active: {
        Args: { _active: boolean; _user_id: string }
        Returns: undefined
      }
      worker_advance: {
        Args: { _next: string; _post_id: string }
        Returns: undefined
      }
      worker_claim: { Args: { _post_id: string }; Returns: undefined }
      worker_open_pool: {
        Args: never
        Returns: {
          approx_distance_km: number
          area: string
          created_at: string
          delivery_area: string
          food_description: string
          id: string
          pickup_lat: number
          pickup_lng: number
          pickup_location: string
          quantity: string
          ready_time: string
          restaurant_name: string
        }[]
      }
      worker_tasks: {
        Args: never
        Returns: {
          assigned_at: string
          claim_mode: string
          created_at: string
          delivered_at: string
          delivery_area: string
          delivery_destination: string
          delivery_lat: number
          delivery_lng: number
          food_description: string
          id: string
          is_confidential: boolean
          picked_up_at: string
          pickup_lat: number
          pickup_lng: number
          pickup_location: string
          quantity: string
          ready_time: string
          restaurant_name: string
          status: string
        }[]
      }
    }
    Enums: {
      app_role: "coordinator" | "source" | "worker"
      source_type: "restaurant" | "bakery" | "grocery" | "other"
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
    Enums: {
      app_role: ["coordinator", "source", "worker"],
      source_type: ["restaurant", "bakery", "grocery", "other"],
    },
  },
} as const
