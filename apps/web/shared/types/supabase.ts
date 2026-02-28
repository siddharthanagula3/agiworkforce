export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      beta_invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          current_uses: number | null;
          discount_percent: number | null;
          email: string | null;
          expires_at: string | null;
          id: string;
          is_active: boolean | null;
          max_uses: number | null;
          plan_tier: string;
          stripe_coupon_id: string | null;
          trial_days: number | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          current_uses?: number | null;
          discount_percent?: number | null;
          email?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          max_uses?: number | null;
          plan_tier?: string;
          stripe_coupon_id?: string | null;
          trial_days?: number | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          current_uses?: number | null;
          discount_percent?: number | null;
          email?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          max_uses?: number | null;
          plan_tier?: string;
          stripe_coupon_id?: string | null;
          trial_days?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'beta_invites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      beta_redemptions: {
        Row: {
          id: string;
          invite_id: string;
          redeemed_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          invite_id: string;
          redeemed_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          invite_id?: string;
          redeemed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'beta_redemptions_invite_id_fkey';
            columns: ['invite_id'];
            isOneToOne: false;
            referencedRelation: 'beta_invites';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'beta_redemptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_folders: {
        Row: {
          color: string;
          created_at: string;
          description: string | null;
          icon: string;
          id: string;
          name: string;
          parent_folder_id: string | null;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          description?: string | null;
          icon?: string;
          id?: string;
          name: string;
          parent_folder_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          description?: string | null;
          icon?: string;
          id?: string;
          name?: string;
          parent_folder_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_folders_parent_folder_id_fkey';
            columns: ['parent_folder_id'];
            isOneToOne: false;
            referencedRelation: 'chat_folders';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_branches: {
        Row: {
          branch_name: string | null;
          branch_point_message_id: string;
          child_session_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          parent_session_id: string;
          user_id: string;
        };
        Insert: {
          branch_name?: string | null;
          branch_point_message_id: string;
          child_session_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          parent_session_id: string;
          user_id: string;
        };
        Update: {
          branch_name?: string | null;
          branch_point_message_id?: string;
          child_session_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          parent_session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_branches_branch_point_message_id_fkey';
            columns: ['branch_point_message_id'];
            isOneToOne: false;
            referencedRelation: 'web_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_branches_child_session_id_fkey';
            columns: ['child_session_id'];
            isOneToOne: false;
            referencedRelation: 'web_conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_branches_parent_session_id_fkey';
            columns: ['parent_session_id'];
            isOneToOne: false;
            referencedRelation: 'web_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_idempotency_keys: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          idempotency_key: string;
          result: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          idempotency_key: string;
          result: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          idempotency_key?: string;
          result?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          amount_cents: number;
          created_at: string;
          credit_account_id: string | null;
          description: string | null;
          id: string;
          metadata: Json | null;
          transaction_type: string;
          user_id: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          credit_account_id?: string | null;
          description?: string | null;
          id?: string;
          metadata?: Json | null;
          transaction_type: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          credit_account_id?: string | null;
          description?: string | null;
          id?: string;
          metadata?: Json | null;
          transaction_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_transactions_credit_account_id_fkey';
            columns: ['credit_account_id'];
            isOneToOne: false;
            referencedRelation: 'token_credits';
            referencedColumns: ['id'];
          },
        ];
      };
      device_authorization_codes: {
        Row: {
          access_token: string | null;
          authorized_at: string | null;
          consumed_at: string | null;
          created_at: string | null;
          denied_at: string | null;
          device_fingerprint: string | null;
          device_id: string;
          device_name: string | null;
          device_type: string | null;
          expires_at: string;
          id: string;
          refresh_token: string | null;
          revoked_at: string | null;
          status: string;
          updated_at: string | null;
          user_code: string;
          user_email: string | null;
          user_id: string | null;
          user_name: string | null;
        };
        Insert: {
          access_token?: string | null;
          authorized_at?: string | null;
          consumed_at?: string | null;
          created_at?: string | null;
          denied_at?: string | null;
          device_fingerprint?: string | null;
          device_id: string;
          device_name?: string | null;
          device_type?: string | null;
          expires_at: string;
          id?: string;
          refresh_token?: string | null;
          revoked_at?: string | null;
          status?: string;
          updated_at?: string | null;
          user_code: string;
          user_email?: string | null;
          user_id?: string | null;
          user_name?: string | null;
        };
        Update: {
          access_token?: string | null;
          authorized_at?: string | null;
          consumed_at?: string | null;
          created_at?: string | null;
          denied_at?: string | null;
          device_fingerprint?: string | null;
          device_id?: string;
          device_name?: string | null;
          device_type?: string | null;
          expires_at?: string;
          id?: string;
          refresh_token?: string | null;
          revoked_at?: string | null;
          status?: string;
          updated_at?: string | null;
          user_code?: string;
          user_email?: string | null;
          user_id?: string | null;
          user_name?: string | null;
        };
        Relationships: [];
      };
      email_preferences: {
        Row: {
          consent_given_at: string | null;
          consent_ip_address: string | null;
          created_at: string;
          email: string;
          id: string;
          marketing_emails: boolean | null;
          product_updates: boolean | null;
          security_alerts: boolean | null;
          unsubscribe_token: string | null;
          unsubscribed_at: string | null;
          updated_at: string;
          user_id: string | null;
          weekly_digest: boolean | null;
        };
        Insert: {
          consent_given_at?: string | null;
          consent_ip_address?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          marketing_emails?: boolean | null;
          product_updates?: boolean | null;
          security_alerts?: boolean | null;
          unsubscribe_token?: string | null;
          unsubscribed_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
          weekly_digest?: boolean | null;
        };
        Update: {
          consent_given_at?: string | null;
          consent_ip_address?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          marketing_emails?: boolean | null;
          product_updates?: boolean | null;
          security_alerts?: boolean | null;
          unsubscribe_token?: string | null;
          unsubscribed_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
          weekly_digest?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      feature_flags: {
        Row: {
          created_at: string;
          enabled: boolean | null;
          flag_name: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean | null;
          flag_name: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean | null;
          flag_name?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feature_flags_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      feedback: {
        Row: {
          created_at: string;
          id: string;
          logs: string | null;
          message: string;
          metadata: Json | null;
          subject: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          logs?: string | null;
          message: string;
          metadata?: Json | null;
          subject: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          logs?: string | null;
          message?: string;
          metadata?: Json | null;
          subject?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      hired_employees: {
        Row: {
          employee_id: string;
          employee_name: string | null;
          hired_at: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          employee_id: string;
          employee_name?: string | null;
          hired_at?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          employee_id?: string;
          employee_name?: string | null;
          hired_at?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      message_bookmarks: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          note: string | null;
          session_id: string;
          tags: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          note?: string | null;
          session_id: string;
          tags?: string[] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          note?: string | null;
          session_id?: string;
          tags?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_bookmarks_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'web_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_bookmarks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'web_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          id: string;
          message_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          id?: string;
          message_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          id?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'web_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      message_read_receipts: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          metadata: Json | null;
          read_at: string;
          session_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          metadata?: Json | null;
          read_at?: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          metadata?: Json | null;
          read_at?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_read_receipts_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'web_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_read_receipts_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'web_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      pricing_plans: {
        Row: {
          created_at: string;
          currency: string;
          features: Json | null;
          id: string;
          interval: string | null;
          is_active: boolean | null;
          monthly_credits_cents: number | null;
          name: string;
          price_cents: number;
          stripe_coupon_id: string | null;
          stripe_price_id: string | null;
          stripe_product_id: string | null;
          tier: Database['public']['Enums']['app_plan_tier'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          features?: Json | null;
          id?: string;
          interval?: string | null;
          is_active?: boolean | null;
          monthly_credits_cents?: number | null;
          name: string;
          price_cents?: number;
          stripe_coupon_id?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          tier: Database['public']['Enums']['app_plan_tier'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          features?: Json | null;
          id?: string;
          interval?: string | null;
          is_active?: boolean | null;
          monthly_credits_cents?: number | null;
          name?: string;
          price_cents?: number;
          stripe_coupon_id?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          tier?: Database['public']['Enums']['app_plan_tier'];
          updated_at?: string;
        };
        Relationships: [];
      };
      processed_stripe_events: {
        Row: {
          attempts: number;
          event_id: string;
          last_error: string | null;
          locked_at: string | null;
          processed_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          event_id: string;
          last_error?: string | null;
          locked_at?: string | null;
          processed_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          event_id?: string;
          last_error?: string | null;
          locked_at?: string | null;
          processed_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          stripe_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          created_at: string;
          id: string;
          referral_code: string;
          referred_email: string | null;
          referred_user_id: string | null;
          referrer_id: string;
          reward_amount: number | null;
          reward_issued_at: string | null;
          reward_type: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          referral_code: string;
          referred_email?: string | null;
          referred_user_id?: string | null;
          referrer_id: string;
          reward_amount?: number | null;
          reward_issued_at?: string | null;
          reward_type?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          referral_code?: string;
          referred_email?: string | null;
          referred_user_id?: string | null;
          referrer_id?: string;
          reward_amount?: number | null;
          reward_issued_at?: string | null;
          reward_type?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referrals_referred_user_id_fkey';
            columns: ['referred_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referrals_referrer_id_fkey';
            columns: ['referrer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      search_history: {
        Row: {
          created_at: string;
          filters: Json | null;
          id: string;
          query: string;
          result_count: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters?: Json | null;
          id?: string;
          query: string;
          result_count?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json | null;
          id?: string;
          query?: string;
          result_count?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      security_audit_logs: {
        Row: {
          created_at: string;
          details: Json | null;
          endpoint: string | null;
          event_type: string;
          id: string;
          ip_address: string | null;
          severity: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          endpoint?: string | null;
          event_type: string;
          id?: string;
          ip_address?: string | null;
          severity?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          endpoint?: string | null;
          event_type?: string;
          id?: string;
          ip_address?: string | null;
          severity?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      signaling_sessions: {
        Row: {
          code: string;
          created_at: number;
          expires_at: number;
          metadata: Json | null;
        };
        Insert: {
          code: string;
          created_at: number;
          expires_at: number;
          metadata?: Json | null;
        };
        Update: {
          code?: string;
          created_at?: number;
          expires_at?: number;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null;
          canceled_at: string | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          plan_tier: string;
          status: string;
          stripe_coupon_id: string | null;
          stripe_customer_id: string | null;
          stripe_price_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          plan_tier?: string;
          status?: string;
          stripe_coupon_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          canceled_at?: string | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          plan_tier?: string;
          status?: string;
          stripe_coupon_id?: string | null;
          stripe_customer_id?: string | null;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      token_credits: {
        Row: {
          created_at: string;
          credits_allocated_cents: number;
          credits_remaining_cents: number;
          credits_used_cents: number;
          daily_used_cents: number | null;
          id: string;
          last_daily_reset_at: string | null;
          period_end: string;
          period_start: string;
          subscription_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_allocated_cents?: number;
          credits_remaining_cents?: number;
          credits_used_cents?: number;
          daily_used_cents?: number | null;
          id?: string;
          last_daily_reset_at?: string | null;
          period_end: string;
          period_start: string;
          subscription_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_allocated_cents?: number;
          credits_remaining_cents?: number;
          credits_used_cents?: number;
          daily_used_cents?: number | null;
          id?: string;
          last_daily_reset_at?: string | null;
          period_end?: string;
          period_start?: string;
          subscription_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'token_credits_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      usage_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json | null;
          quantity: number | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json | null;
          quantity?: number | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json | null;
          quantity?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_shortcuts: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          label: string;
          prompt: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          label: string;
          prompt: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          label?: string;
          prompt?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      vibe_files: {
        Row: {
          content: string | null;
          created_at: string | null;
          filename: string;
          id: string;
          language: string | null;
          session_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          filename: string;
          id?: string;
          language?: string | null;
          session_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          filename?: string;
          id?: string;
          language?: string | null;
          session_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          billing_interval: string | null;
          company: string | null;
          converted_at: string | null;
          created_at: string;
          email: string;
          id: string;
          invited_at: string | null;
          ip_address: string | null;
          joined_at: string | null;
          marketing_consent: boolean | null;
          name: string | null;
          plan: string | null;
          referral_code: string | null;
          referral_source: string | null;
          role: string | null;
          source: string | null;
          status: string;
          updated_at: string | null;
          use_case: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          billing_interval?: string | null;
          company?: string | null;
          converted_at?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          invited_at?: string | null;
          ip_address?: string | null;
          joined_at?: string | null;
          marketing_consent?: boolean | null;
          name?: string | null;
          plan?: string | null;
          referral_code?: string | null;
          referral_source?: string | null;
          role?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string | null;
          use_case?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          billing_interval?: string | null;
          company?: string | null;
          converted_at?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          invited_at?: string | null;
          ip_address?: string | null;
          joined_at?: string | null;
          marketing_consent?: boolean | null;
          name?: string | null;
          plan?: string | null;
          referral_code?: string | null;
          referral_source?: string | null;
          role?: string | null;
          source?: string | null;
          status?: string;
          updated_at?: string | null;
          use_case?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      web_conversations: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          employee_id: string | null;
          folder_id: string | null;
          id: string;
          is_active: boolean | null;
          is_archived: boolean | null;
          is_pinned: boolean | null;
          is_starred: boolean | null;
          last_message_at: string | null;
          metadata: Json | null;
          model: string | null;
          provider: string | null;
          role: string | null;
          shared_link: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          employee_id?: string | null;
          folder_id?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_archived?: boolean | null;
          is_pinned?: boolean | null;
          is_starred?: boolean | null;
          last_message_at?: string | null;
          metadata?: Json | null;
          model?: string | null;
          provider?: string | null;
          role?: string | null;
          shared_link?: string | null;
          title?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          employee_id?: string | null;
          folder_id?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_archived?: boolean | null;
          is_pinned?: boolean | null;
          is_starred?: boolean | null;
          last_message_at?: string | null;
          metadata?: Json | null;
          model?: string | null;
          provider?: string | null;
          role?: string | null;
          shared_link?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'web_conversations_folder_id_fkey';
            columns: ['folder_id'];
            isOneToOne: false;
            referencedRelation: 'chat_folders';
            referencedColumns: ['id'];
          },
        ];
      };
      web_messages: {
        Row: {
          content: string;
          conversation_id: string;
          cost_cents: number | null;
          created_at: string;
          edit_count: number | null;
          edited: boolean | null;
          id: string;
          input_tokens: number | null;
          model: string | null;
          output_tokens: number | null;
          provider: string | null;
          role: string;
          updated_at: string | null;
        };
        Insert: {
          content: string;
          conversation_id: string;
          cost_cents?: number | null;
          created_at?: string;
          edit_count?: number | null;
          edited?: boolean | null;
          id?: string;
          input_tokens?: number | null;
          model?: string | null;
          output_tokens?: number | null;
          provider?: string | null;
          role: string;
          updated_at?: string | null;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          cost_cents?: number | null;
          created_at?: string;
          edit_count?: number | null;
          edited?: boolean | null;
          id?: string;
          input_tokens?: number | null;
          model?: string | null;
          output_tokens?: number | null;
          provider?: string | null;
          role?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'web_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'web_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      bookmarked_messages: {
        Row: {
          bookmark_note: string | null;
          bookmark_tags: string[] | null;
          bookmarked_at: string | null;
          id: string | null;
          message_content: string | null;
          message_created_at: string | null;
          message_id: string | null;
          message_role: string | null;
          session_created_at: string | null;
          session_id: string | null;
          session_title: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_bookmarks_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'web_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_bookmarks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'web_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      add_credits: {
        Args: {
          p_account_id: string;
          p_amount_cents: number;
          p_description: string;
          p_transaction_type?: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      calculate_daily_limit: {
        Args: { monthly_cents: number };
        Returns: number;
      };
      check_credits_available: {
        Args: { p_amount_cents: number; p_user_id: string };
        Returns: boolean;
      };
      check_daily_credits_available: {
        Args: { p_amount: number; p_user_id: string };
        Returns: boolean;
      };
      claim_beta_invite: {
        Args: { p_invite_id: string; p_plan_tier?: string; p_user_id: string };
        Returns: Json;
      };
      cleanup_expired_idempotency_keys: { Args: never; Returns: number };
      clear_search_history: { Args: { p_user_id: string }; Returns: number };
      consume_device_authorization_tokens: {
        Args: { p_device_id: string };
        Returns: {
          access_token: string;
          refresh_token: string;
          status: string;
          user_email: string;
          user_id: string;
          user_name: string;
        }[];
      };
      deduct_credits:
        | {
            Args: {
              p_amount_cents: number;
              p_description?: string;
              p_metadata?: Json;
              p_user_id: string;
            };
            Returns: {
              code: string;
              daily_limit: number;
              daily_remaining: number;
              daily_used: number;
              error: string;
              remaining_cents: number;
              reset_in_hours: number;
              success: boolean;
            }[];
          }
        | {
            Args: {
              p_amount_cents: number;
              p_description?: string;
              p_idempotency_key?: string;
              p_metadata?: Json;
              p_user_id: string;
            };
            Returns: {
              code: string;
              daily_limit: number;
              daily_remaining: number;
              daily_used: number;
              error: string;
              remaining_cents: number;
              reset_in_hours: number;
              success: boolean;
            }[];
          };
      get_branch_history: {
        Args: { p_session_id: string };
        Returns: {
          branch_name: string;
          branch_point_message_id: string;
          depth: number;
          session_id: string;
        }[];
      };
      get_credit_balance: {
        Args: { p_user_id: string };
        Returns: {
          account_id: string;
          credits_allocated_cents: number;
          credits_remaining_cents: number;
          credits_used_cents: number;
          daily_limit_cents: number;
          daily_remaining_cents: number;
          daily_used_cents: number;
          last_daily_reset_at: string;
          period_end: string;
          period_start: string;
        }[];
      };
      get_message_reactions: {
        Args: { message_ids: string[] };
        Returns: {
          count: number;
          emoji: string;
          message_id: string;
          user_ids: string[];
          user_reacted: boolean;
        }[];
      };
      get_or_create_credit_account: {
        Args: {
          p_credits_allocated_cents: number;
          p_period_end: string;
          p_period_start: string;
          p_subscription_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      get_popular_searches: {
        Args: { p_days?: number; p_limit?: number };
        Returns: {
          avg_results: number;
          query: string;
          search_count: number;
        }[];
      };
      get_recent_searches: {
        Args: { p_limit?: number; p_user_id: string };
        Returns: {
          created_at: string;
          query: string;
          result_count: number;
        }[];
      };
      get_root_session: { Args: { session_id: string }; Returns: string };
      get_search_suggestions: {
        Args: { p_limit?: number; p_partial_query: string; p_user_id: string };
        Returns: {
          score: number;
          source: string;
          suggestion: string;
        }[];
      };
      get_user_by_stripe_customer_id: {
        Args: { p_customer_id: string };
        Returns: {
          email: string;
          user_id: string;
        }[];
      };
      handle_refund: {
        Args: {
          p_reason?: string;
          p_refund_amount_cents: number;
          p_user_id: string;
        };
        Returns: boolean;
      };
      link_stripe_customer: {
        Args: { p_customer_id: string; p_user_id: string };
        Returns: boolean;
      };
      mark_stripe_event_failed: {
        Args: { p_error: string; p_event_id: string };
        Returns: boolean;
      };
      mark_stripe_event_succeeded: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      move_session_to_folder: {
        Args: { p_folder_id: string; p_session_id: string };
        Returns: undefined;
      };
      process_stripe_event_idempotent: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      reset_credits_for_period: {
        Args: {
          p_credits_allocated_cents: number;
          p_period_end: string;
          p_period_start: string;
          p_subscription_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      track_search: {
        Args: {
          p_filters?: Json;
          p_query: string;
          p_result_count: number;
          p_user_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_plan_tier: 'free' | 'hobby' | 'pro' | 'max' | 'enterprise';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_plan_tier: ['free', 'hobby', 'pro', 'max', 'enterprise'],
    },
  },
} as const;
