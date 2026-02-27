-- Migration: Add messaging_connections table for WhatsApp/Telegram/Slack integration
-- Phase 8: Messaging Integration

CREATE TABLE IF NOT EXISTS public.messaging_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram', 'slack')),
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

ALTER TABLE public.messaging_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own messaging connections"
  ON public.messaging_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_messaging_connections_user ON public.messaging_connections(user_id);
