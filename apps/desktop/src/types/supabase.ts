export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
      email_campaigns: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          preview_text: string | null;
          scheduled_at: string | null;
          segment: string;
          sent_at: string | null;
          status: string;
          subject: string;
          template_id: string | null;
          total_clicked: number | null;
          total_opened: number | null;
          total_recipients: number | null;
          total_sent: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          preview_text?: string | null;
          scheduled_at?: string | null;
          segment?: string;
          sent_at?: string | null;
          status?: string;
          subject: string;
          template_id?: string | null;
          total_clicked?: number | null;
          total_opened?: number | null;
          total_recipients?: number | null;
          total_sent?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          preview_text?: string | null;
          scheduled_at?: string | null;
          segment?: string;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          template_id?: string | null;
          total_clicked?: number | null;
          total_opened?: number | null;
          total_recipients?: number | null;
          total_sent?: number | null;
          updated_at?: string;
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
      email_sends: {
        Row: {
          bounce_reason: string | null;
          campaign_id: string | null;
          clicked_at: string | null;
          created_at: string;
          delivered_at: string | null;
          email: string;
          id: string;
          opened_at: string | null;
          sent_at: string | null;
          status: string;
          user_id: string | null;
        };
        Insert: {
          bounce_reason?: string | null;
          campaign_id?: string | null;
          clicked_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          email: string;
          id?: string;
          opened_at?: string | null;
          sent_at?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          bounce_reason?: string | null;
          campaign_id?: string | null;
          clicked_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          email?: string;
          id?: string;
          opened_at?: string | null;
          sent_at?: string | null;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_sends_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'email_campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_sends_user_id_fkey';
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
      pricing_plans: {
        Row: {
          created_at: string;
          currency: string;
          features: Json | null;
          id: string;
          interval: string | null;
          is_active: boolean | null;
          name: string;
          price_cents: number;
          stripe_price_id: string | null;
          stripe_product_id: string | null;
          tier: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          features?: Json | null;
          id?: string;
          interval?: string | null;
          is_active?: boolean | null;
          name: string;
          price_cents?: number;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          tier: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          features?: Json | null;
          id?: string;
          interval?: string | null;
          is_active?: boolean | null;
          name?: string;
          price_cents?: number;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          tier?: string;
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
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
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
            isOneToOne: false;
            referencedRelation: 'profiles';
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
      waitlist: {
        Row: {
          company: string | null;
          converted_at: string | null;
          created_at: string;
          email: string;
          id: string;
          invited_at: string | null;
          ip_address: string | null;
          marketing_consent: boolean | null;
          name: string | null;
          referral_code: string | null;
          referral_source: string | null;
          role: string | null;
          status: string;
          use_case: string | null;
          user_agent: string | null;
        };
        Insert: {
          company?: string | null;
          converted_at?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          invited_at?: string | null;
          ip_address?: string | null;
          marketing_consent?: boolean | null;
          name?: string | null;
          referral_code?: string | null;
          referral_source?: string | null;
          role?: string | null;
          status?: string;
          use_case?: string | null;
          user_agent?: string | null;
        };
        Update: {
          company?: string | null;
          converted_at?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          invited_at?: string | null;
          ip_address?: string | null;
          marketing_consent?: boolean | null;
          name?: string | null;
          referral_code?: string | null;
          referral_source?: string | null;
          role?: string | null;
          status?: string;
          use_case?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database;
}
  ? Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;
