-- GitHub App installations for PR review automation
CREATE TABLE public.github_installations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    installation_id         BIGINT NOT NULL UNIQUE,
    account_login           TEXT NOT NULL,
    account_type            TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
    access_token_enc        TEXT,
    access_token_expires_at TIMESTAMPTZ,
    pr_review_enabled       BOOLEAN DEFAULT true,
    review_model            TEXT DEFAULT 'auto',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_installations_user_id ON public.github_installations(user_id);
CREATE INDEX idx_github_installations_installation_id ON public.github_installations(installation_id);

-- RLS: owners can only see/manage their own installations
ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own installations"
    ON public.github_installations FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create their own installations"
    ON public.github_installations FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own installations"
    ON public.github_installations FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own installations"
    ON public.github_installations FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
