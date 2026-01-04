import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface TestUserCredentials {
  id: string;
  email: string;
  password: string;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  plan_tier: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export interface ProfileRecord {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditAccountRecord {
  id: string;
  user_id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  created_at: string;
  updated_at: string;
  daily_used_cents?: number;
  last_daily_reset_at?: string;
}

export class TestDatabase {
  private client: SupabaseClient | null = null;
  private supabaseUrl: string;
  private serviceRoleKey: string;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    this.supabaseUrl = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    this.serviceRoleKey = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error(
        'Supabase configuration missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
      );
    }
  }

  /**
   * Initialize Supabase admin client using service role key
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = createClient(this.supabaseUrl, this.serviceRoleKey, {
      auth: { persistSession: false },
      db: { schema: 'public' },
    });

    // Verify connection
    const { error } = await this.client.from('profiles').select('id').limit(1);
    if (error) {
      throw new Error(`Failed to connect to Supabase: ${error.message}`);
    }
  }

  /**
   * Ensure connection is established
   */
  private ensureConnected(): SupabaseClient {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get the Supabase client for direct queries
   * @returns The Supabase client instance
   */
  getClient(): SupabaseClient {
    return this.ensureConnected();
  }

  /**
   * Create a test user using Supabase Admin API
   */
  async createTestUser(email: string, password: string): Promise<TestUserCredentials> {
    const client = this.ensureConnected();

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Failed to create test user: ${error.message}`);
    }

    if (!data.user?.id) {
      throw new Error('User created but no ID returned');
    }

    return {
      id: data.user.id,
      email,
      password,
    };
  }

  /**
   * Delete a test user by ID
   */
  async deleteTestUser(userId: string): Promise<void> {
    const client = this.ensureConnected();

    const { error } = await client.auth.admin.deleteUser(userId);

    if (error) {
      throw new Error(`Failed to delete test user: ${error.message}`);
    }
  }

  /**
   * Get user by email - returns user ID from auth.users
   */
  async getUserByEmail(email: string): Promise<string | null> {
    const client = this.ensureConnected();

    const { data, error } = await client.auth.admin.listUsers();

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const user = data.users.find((u) => (u as unknown as { email?: string })?.email === email);
    return user?.id || null;
  }

  /**
   * Get subscription record for a user
   */
  async getSubscription(userId: string): Promise<SubscriptionRecord | null> {
    const client = this.ensureConnected();

    const { data, error } = await client
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw new Error(`Failed to get subscription: ${error.message}`);
    }

    return data as SubscriptionRecord;
  }

  /**
   * Get profile record for a user
   */
  async getProfile(userId: string): Promise<ProfileRecord | null> {
    const client = this.ensureConnected();

    const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw new Error(`Failed to get profile: ${error.message}`);
    }

    return data as ProfileRecord;
  }

  /**
   * Poll subscriptions table until a subscription appears or timeout
   * Uses exponential backoff for polling
   */
  async waitForSubscription(
    userId: string,
    timeout: number = 30000,
    initialInterval: number = 500,
  ): Promise<SubscriptionRecord> {
    const startTime = Date.now();
    let interval = initialInterval;
    const maxInterval = 5000;

    while (Date.now() - startTime < timeout) {
      try {
        const subscription = await this.getSubscription(userId);

        if (subscription) {
          return subscription;
        }
      } catch (error) {
        // Log but continue polling
        console.log(
          `Poll attempt failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Wait before next poll with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, interval));

      // Increase interval for next attempt, capped at maxInterval
      interval = Math.min(interval * 1.5, maxInterval);
    }

    throw new Error(`Subscription not found for user ${userId} after ${timeout}ms`);
  }

  /**
   * Remove all test data - cleanup subscriptions, credit accounts, and profiles for a user
   */
  async cleanup(userId?: string): Promise<void> {
    const client = this.ensureConnected();

    if (userId) {
      // Delete credit accounts if they exist
      const { error: creditError } = await client
        .from('token_credits')
        .delete()
        .eq('user_id', userId);

      if (creditError && creditError.code !== 'PGRST116') {
        console.warn(`Failed to delete credit accounts: ${creditError.message}`);
      }

      // Delete subscription if it exists
      const { error: subError } = await client.from('subscriptions').delete().eq('user_id', userId);

      if (subError && subError.code !== 'PGRST116') {
        console.warn(`Failed to delete subscription: ${subError.message}`);
      }

      // Delete profile if it exists
      const { error: profileError } = await client.from('profiles').delete().eq('id', userId);

      if (profileError && profileError.code !== 'PGRST116') {
        console.warn(`Failed to delete profile: ${profileError.message}`);
      }
    }
  }

  /**
   * Create a subscription for a test user
   */
  async createSubscription(
    userId: string,
    data: Partial<SubscriptionRecord>,
  ): Promise<SubscriptionRecord> {
    if (!this.client) {
      throw new Error('Database not connected');
    }

    const subscriptionData = {
      user_id: userId,
      plan_tier: data.plan_tier || 'hobby',
      status: data.status || 'active',
      stripe_customer_id: data.stripe_customer_id || null,
      stripe_subscription_id: data.stripe_subscription_id || null,
      current_period_start: data.current_period_start || new Date().toISOString(),
      current_period_end:
        data.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data: subscription, error } = await this.client
      .from('subscriptions')
      .insert([subscriptionData as Record<string, unknown>])
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create subscription: ${error.message}`);
    }

    return subscription as SubscriptionRecord;
  }

  /**
   * Create a credit account for a test user
   */
  async createCreditAccount(
    userId: string,
    subscriptionId: string,
    data?: Partial<CreditAccountRecord>,
  ): Promise<CreditAccountRecord> {
    if (!this.client) {
      throw new Error('Database not connected');
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const allocatedCents = data?.credits_allocated_cents || 10000; // Default $100
    const usedCents = data?.credits_used_cents || 0;

    const creditAccountData = {
      user_id: userId,
      subscription_id: subscriptionId,
      period_start: data?.period_start || now.toISOString(),
      period_end: data?.period_end || periodEnd.toISOString(),
      credits_allocated_cents: allocatedCents,
      credits_used_cents: usedCents,
      credits_remaining_cents: data?.credits_remaining_cents ?? allocatedCents - usedCents,
    };

    const { data: creditAccount, error } = await this.client
      .from('token_credits')
      .insert([creditAccountData as Record<string, unknown>])
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create credit account: ${error.message}`);
    }

    return creditAccount as CreditAccountRecord;
  }

  /**
   * Get credit account for a user
   */
  async getCreditAccount(userId: string): Promise<CreditAccountRecord | null> {
    const client = this.ensureConnected();

    const { data, error } = await client
      .from('token_credits')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw new Error(`Failed to get credit account: ${error.message}`);
    }

    return data as CreditAccountRecord;
  }

  /**
   * Close the connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client = null;
    }
  }
}
