-- Waitlist table for gated pricing plans (Pro/Max)

CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    plan TEXT NOT NULL CHECK (plan IN ('pro', 'max')),
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
    source TEXT NOT NULL DEFAULT 'pricing',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, plan)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_user_id ON public.waitlist(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_plan ON public.waitlist(plan);
CREATE INDEX IF NOT EXISTS idx_waitlist_joined_at ON public.waitlist(joined_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own waitlist rows"
    ON public.waitlist FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own waitlist rows"
    ON public.waitlist FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own waitlist rows"
    ON public.waitlist FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.waitlist TO authenticated;
