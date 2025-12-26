-- Inferred Schema for 'subscriptions' table based on apps/web/app/api/stripe-webhook/route.ts

-- Enable RLS (Row Level Security)
alter table "public"."subscriptions" enable row level security;

create table "public"."subscriptions" (
    "user_id" uuid not null references auth.users(id) on delete cascade,
    "status" text not null,
    "plan_tier" text, -- 'hobby', 'pro', 'max', 'enterprise'
    "stripe_customer_id" text,
    "stripe_subscription_id" text,
    "stripe_price_id" text,
    "stripe_coupon_id" text,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean default false,
    "canceled_at" timestamp with time zone,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key ("user_id")
);

-- Indexes for performance
create index if not exists idx_subscriptions_stripe_customer_id on "public"."subscriptions" using btree ("stripe_customer_id");
create index if not exists idx_subscriptions_stripe_subscription_id on "public"."subscriptions" using btree ("stripe_subscription_id");

-- RLS Policies (Standard patterns)
create policy "Users can view own subscription"
on "public"."subscriptions"
for select
to authenticated
using (auth.uid() = user_id);

-- Table for Stripe Webhook Idempotency
create table "public"."processed_stripe_events" (
    "event_id" text not null primary key,
    "processed_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Processed Stripe Events Table
alter table "public"."processed_stripe_events" enable row level security;

-- Only service role can access this table
create policy "Service role manages processed events"
on "public"."processed_stripe_events"
for all
to service_role
using (true)
with check (true);

-- Only service role can insert/update/delete (handled via webhooks)
create policy "Service role can manage all subscriptions"
on "public"."subscriptions"
for all
to service_role
using (true)
with check (true);

-- Inferred Schema for 'beta_invites' and 'beta_redemptions' based on apps/web/app/api/claim-offer/route.ts

-- Beta Invites Table
create table "public"."beta_invites" (
    "id" uuid not null default gen_random_uuid() primary key,
    "code" text not null unique,
    "is_active" boolean default true,
    "plan_tier" text default 'hobby',
    "trial_days" integer default 90,
    "discount_percent" integer default 100,
    "current_uses" integer default 0,
    "max_uses" integer default 1,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Beta Redemptions Table
create table "public"."beta_redemptions" (
    "id" uuid not null default gen_random_uuid() primary key,
    "invite_id" uuid not null references "public"."beta_invites"(id) on delete cascade,
    "user_id" uuid not null references auth.users(id) on delete cascade,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    unique("invite_id", "user_id")
);

-- RLS for Beta Tables
alter table "public"."beta_invites" enable row level security;
alter table "public"."beta_redemptions" enable row level security;

-- Public can read active invites to validate code (or limit to service role via API)
create policy "Service role manages beta invites"
on "public"."beta_invites"
for all
to service_role
using (true)
with check (true);

-- Users can read their own redemptions
create policy "Users view own redemptions"
on "public"."beta_redemptions"
for select
to authenticated
using (auth.uid() = user_id);
