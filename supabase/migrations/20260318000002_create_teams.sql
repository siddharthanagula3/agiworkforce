-- W3.4: Teams with RBAC (admin, editor, viewer)

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text DEFAULT '',
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Teams: owners and members can see their teams
CREATE POLICY "Team members can view their teams" ON public.teams
  FOR SELECT USING (
    owner_id = auth.uid() OR
    id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- Teams: only owner can insert/update/delete
CREATE POLICY "Team owners can manage teams" ON public.teams
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Team members: admins can manage members, all members can view
CREATE POLICY "Team members can view their memberships" ON public.team_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid()) OR
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Team admins can manage members" ON public.team_members
  FOR INSERT WITH CHECK (
    team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid()) OR
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Team admins can update members" ON public.team_members
  FOR UPDATE USING (
    team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid()) OR
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Team admins can delete members" ON public.team_members
  FOR DELETE USING (
    team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid()) OR
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role full access on teams" ON public.teams
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on team_members" ON public.team_members
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_teams_updated_at ON public.teams;
CREATE TRIGGER trigger_teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION public.update_teams_updated_at();
