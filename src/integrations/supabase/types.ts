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
      auth_nonces: {
        Row: {
          address: string
          created_at: string
          expires_at: string
          nonce: string
          used: boolean
        }
        Insert: {
          address: string
          created_at?: string
          expires_at: string
          nonce: string
          used?: boolean
        }
        Update: {
          address?: string
          created_at?: string
          expires_at?: string
          nonce?: string
          used?: boolean
        }
        Relationships: []
      }
      miner_settings: {
        Row: {
          batch_delay_ms: number
          batch_size: number
          mining_mode: string
          overclock: number
          threads: number
          updated_at: string
          user_id: string
          wallet_address: string
          worker_name: string
        }
        Insert: {
          batch_delay_ms?: number
          batch_size?: number
          mining_mode?: string
          overclock?: number
          threads?: number
          updated_at?: string
          user_id: string
          wallet_address?: string
          worker_name?: string
        }
        Update: {
          batch_delay_ms?: number
          batch_size?: number
          mining_mode?: string
          overclock?: number
          threads?: number
          updated_at?: string
          user_id?: string
          wallet_address?: string
          worker_name?: string
        }
        Relationships: []
      }
      miner_stats: {
        Row: {
          first_started: string | null
          last_updated: string | null
          lifetime_mining_seconds: number
          lifetime_rejected: number
          lifetime_reward: number
          lifetime_shares: number
          total_sessions: number
          user_id: string
        }
        Insert: {
          first_started?: string | null
          last_updated?: string | null
          lifetime_mining_seconds?: number
          lifetime_rejected?: number
          lifetime_reward?: number
          lifetime_shares?: number
          total_sessions?: number
          user_id: string
        }
        Update: {
          first_started?: string | null
          last_updated?: string | null
          lifetime_mining_seconds?: number
          lifetime_rejected?: number
          lifetime_reward?: number
          lifetime_shares?: number
          total_sessions?: number
          user_id?: string
        }
        Relationships: []
      }
      mining_profiles: {
        Row: {
          algorithm: string
          coin: string
          created_at: string
          device: string
          extra_args: string
          id: string
          miner: string
          mining_mode: string
          name: string
          pool_password: string
          pool_url: string
          updated_at: string
          user_id: string
          wallet_address: string
          worker_name: string
        }
        Insert: {
          algorithm?: string
          coin?: string
          created_at?: string
          device?: string
          extra_args?: string
          id?: string
          miner?: string
          mining_mode?: string
          name?: string
          pool_password?: string
          pool_url?: string
          updated_at?: string
          user_id: string
          wallet_address?: string
          worker_name?: string
        }
        Update: {
          algorithm?: string
          coin?: string
          created_at?: string
          device?: string
          extra_args?: string
          id?: string
          miner?: string
          mining_mode?: string
          name?: string
          pool_password?: string
          pool_url?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
          worker_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          username: string | null
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          id: string
          username?: string | null
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          username?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      rig_commands: {
        Row: {
          command: string
          created_at: string
          id: string
          payload: Json
          result: string
          rig_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          command: string
          created_at?: string
          id?: string
          payload?: Json
          result?: string
          rig_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          command?: string
          created_at?: string
          id?: string
          payload?: Json
          result?: string
          rig_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rig_commands_rig_id_fkey"
            columns: ["rig_id"]
            isOneToOne: false
            referencedRelation: "rigs"
            referencedColumns: ["id"]
          },
        ]
      }
      rig_update_history: {
        Row: {
          id: string
          installed_version: string
          message: string
          occurred_at: string
          received_at: string
          result: string
          rig_id: string
          target_version: string
        }
        Insert: {
          id: string
          installed_version: string
          message?: string
          occurred_at: string
          received_at?: string
          result: string
          rig_id: string
          target_version?: string
        }
        Update: {
          id?: string
          installed_version?: string
          message?: string
          occurred_at?: string
          received_at?: string
          result?: string
          rig_id?: string
          target_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "rig_update_history_rig_id_fkey"
            columns: ["rig_id"]
            isOneToOne: false
            referencedRelation: "rigs"
            referencedColumns: ["id"]
          },
        ]
      }
      rigs: {
        Row: {
          agent_version: string
          created_at: string
          desired_state: string
          hardware: Json
          hostname: string
          id: string
          kind: string
          last_seen_at: string | null
          log: string[]
          name: string
          platform: string
          profile_id: string | null
          stats: Json
          status: string
          token_hash: string | null
          tuning: Json
          user_id: string
        }
        Insert: {
          agent_version?: string
          created_at?: string
          desired_state?: string
          hardware?: Json
          hostname?: string
          id?: string
          kind?: string
          last_seen_at?: string | null
          log?: string[]
          name?: string
          platform?: string
          profile_id?: string | null
          stats?: Json
          status?: string
          token_hash?: string | null
          tuning?: Json
          user_id: string
        }
        Update: {
          agent_version?: string
          created_at?: string
          desired_state?: string
          hardware?: Json
          hostname?: string
          id?: string
          kind?: string
          last_seen_at?: string | null
          log?: string[]
          name?: string
          platform?: string
          profile_id?: string | null
          stats?: Json
          status?: string
          token_hash?: string | null
          tuning?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rigs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "mining_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rpc_endpoints: {
        Row: {
          cf_client_id: string
          cf_client_secret: string
          created_at: string
          has_cf_secret: boolean | null
          id: string
          label: string
          position: number
          profile_id: string | null
          url: string
          user_id: string
        }
        Insert: {
          cf_client_id?: string
          cf_client_secret?: string
          created_at?: string
          has_cf_secret?: boolean | null
          id?: string
          label?: string
          position?: number
          profile_id?: string | null
          url: string
          user_id: string
        }
        Update: {
          cf_client_id?: string
          cf_client_secret?: string
          created_at?: string
          has_cf_secret?: boolean | null
          id?: string
          label?: string
          position?: number
          profile_id?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rpc_endpoints_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "mining_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      record_miner_stats: {
        Args: {
          _new_session?: boolean
          _rejected?: number
          _reward?: number
          _seconds?: number
          _shares?: number
        }
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
