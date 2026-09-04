import { harnessTemplates } from '@/lib/e2b/templates';

export const HARNESSES = harnessTemplates().map((harness) => ({
  id: harness.id,
  name: harness.name,
  kind: harness.summary,
}));
