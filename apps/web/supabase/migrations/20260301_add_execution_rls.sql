-- RLS for workforce_executions
ALTER TABLE workforce_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own executions"
ON workforce_executions FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can only insert their own executions"
ON workforce_executions FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can only update their own executions"
ON workforce_executions FOR UPDATE
USING (auth.uid()::text = user_id);

-- RLS for workforce_tasks
ALTER TABLE workforce_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own tasks"
ON workforce_tasks FOR SELECT
USING (execution_id IN (
  SELECT id FROM workforce_executions WHERE auth.uid()::text = user_id
));

CREATE POLICY "Users can only insert their own tasks"
ON workforce_tasks FOR INSERT
WITH CHECK (execution_id IN (
  SELECT id FROM workforce_executions WHERE auth.uid()::text = user_id
));

CREATE POLICY "Users can only update their own tasks"
ON workforce_tasks FOR UPDATE
USING (execution_id IN (
  SELECT id FROM workforce_executions WHERE auth.uid()::text = user_id
));
