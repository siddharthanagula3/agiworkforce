-- Create the 4 missing multi-agent chat tables referenced by:
--   apps/web/core/storage/chat/multi-agent-chat-database.ts
--   apps/web/core/storage/chat/collaboration-database.ts
-- Type definitions: apps/web/shared/types/multi-agent-chat.ts

-- =============================================================================
-- 1. multi_agent_conversations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.multi_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  description TEXT,
  conversation_type TEXT NOT NULL DEFAULT 'multi_agent'
    CHECK (conversation_type IN ('single', 'multi_agent', 'collaborative', 'mission_control')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived', 'failed')),

  -- Configuration
  orchestration_mode TEXT NOT NULL DEFAULT 'automatic'
    CHECK (orchestration_mode IN ('automatic', 'manual', 'supervised')),
  collaboration_strategy TEXT NOT NULL DEFAULT 'parallel'
    CHECK (collaboration_strategy IN ('parallel', 'sequential', 'hierarchical')),
  max_agents INTEGER NOT NULL DEFAULT 10,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Statistics (updated by application logic)
  total_messages INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  active_agents_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.multi_agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own multi-agent conversations"
  ON public.multi_agent_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own multi-agent conversations"
  ON public.multi_agent_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own multi-agent conversations"
  ON public.multi_agent_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own multi-agent conversations"
  ON public.multi_agent_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages multi-agent conversations"
  ON public.multi_agent_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_multi_agent_conversations_user
  ON public.multi_agent_conversations(user_id, updated_at DESC);
CREATE INDEX idx_multi_agent_conversations_status
  ON public.multi_agent_conversations(user_id, status);

-- =============================================================================
-- 2. conversation_participants
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.multi_agent_conversations(id) ON DELETE CASCADE NOT NULL,

  -- Agent identification
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  employee_role TEXT NOT NULL,
  employee_provider TEXT NOT NULL,

  -- Participation details
  participant_role TEXT NOT NULL DEFAULT 'collaborator'
    CHECK (participant_role IN ('lead', 'collaborator', 'advisor', 'reviewer', 'observer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'idle', 'working', 'completed', 'removed')),

  -- Capabilities
  capabilities TEXT[] NOT NULL DEFAULT '{}',
  tools_available TEXT[] NOT NULL DEFAULT '{}',

  -- Statistics
  message_count INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_incurred NUMERIC NOT NULL DEFAULT 0,
  tasks_assigned INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,

  -- Activity tracking
  last_active_at TIMESTAMPTZ,
  total_active_duration INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- Participants are accessible if user owns the conversation
CREATE POLICY "Users can view participants of own conversations"
  ON public.conversation_participants FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.multi_agent_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage participants of own conversations"
  ON public.conversation_participants FOR ALL
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.multi_agent_conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.multi_agent_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages conversation participants"
  ON public.conversation_participants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_conversation_participants_conversation
  ON public.conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_employee
  ON public.conversation_participants(employee_id);

-- =============================================================================
-- 3. conversation_metadata
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.conversation_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.multi_agent_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Display settings
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  folder_id TEXT,

  -- Sharing settings
  is_public BOOLEAN NOT NULL DEFAULT false,
  share_token TEXT,
  shared_with TEXT[] NOT NULL DEFAULT '{}',

  -- Model configuration
  default_model TEXT,
  default_temperature NUMERIC,
  default_max_tokens INTEGER,

  -- UI preferences
  ui_settings JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Analytics
  view_count INTEGER NOT NULL DEFAULT 0,
  export_count INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One metadata row per user per conversation
  CONSTRAINT uq_conversation_metadata_user UNIQUE (conversation_id, user_id)
);

ALTER TABLE public.conversation_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversation metadata"
  ON public.conversation_metadata FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own conversation metadata"
  ON public.conversation_metadata FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages conversation metadata"
  ON public.conversation_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_conversation_metadata_conversation
  ON public.conversation_metadata(conversation_id);
CREATE INDEX idx_conversation_metadata_user
  ON public.conversation_metadata(user_id);

-- =============================================================================
-- 4. agent_collaborations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.agent_collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.multi_agent_conversations(id) ON DELETE CASCADE NOT NULL,

  -- Collaboration details
  session_name TEXT,
  session_type TEXT NOT NULL DEFAULT 'task_based'
    CHECK (session_type IN ('task_based', 'brainstorming', 'review', 'problem_solving', 'research')),

  -- Participating agents
  participant_ids TEXT[] NOT NULL DEFAULT '{}',
  lead_participant_id TEXT,

  -- Task tracking
  task_description TEXT NOT NULL,
  task_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (task_status IN ('pending', 'in_progress', 'reviewing', 'completed', 'failed', 'cancelled')),

  -- Collaboration flow
  workflow_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_step INTEGER NOT NULL DEFAULT 0,

  -- Results
  collaboration_result JSONB,
  output_artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Metrics
  total_messages INTEGER NOT NULL DEFAULT 0,
  total_iterations INTEGER NOT NULL DEFAULT 0,
  consensus_score NUMERIC,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_collaborations ENABLE ROW LEVEL SECURITY;

-- Collaborations are accessible if user owns the parent conversation
CREATE POLICY "Users can view collaborations of own conversations"
  ON public.agent_collaborations FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.multi_agent_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage collaborations of own conversations"
  ON public.agent_collaborations FOR ALL
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.multi_agent_conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.multi_agent_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages agent collaborations"
  ON public.agent_collaborations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_agent_collaborations_conversation
  ON public.agent_collaborations(conversation_id);
CREATE INDEX idx_agent_collaborations_status
  ON public.agent_collaborations(task_status);
