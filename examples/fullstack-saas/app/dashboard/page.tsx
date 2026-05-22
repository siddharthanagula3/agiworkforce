import { redirect } from 'next/navigation';
import ProjectConsole from '@/components/ProjectConsole';
import { requireUserOrRedirect } from '@/lib/auth';
import { getJsonCache, setJsonCache } from '@/lib/cache';
import type { Project, ProjectMetrics, Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams?: Promise<{ project?: string }>;
}

function calculateMetrics(tasks: Task[]): ProjectMetrics {
  return tasks.reduce<ProjectMetrics>(
    (metrics, task) => {
      metrics.total += 1;
      metrics[task.status] += 1;
      return metrics;
    },
    { total: 0, todo: 0, doing: 0, blocked: 0, done: 0 },
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { supabase, user } = await requireUserOrRedirect();
  const params = await searchParams;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single();
  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('id, owner_id, name, slug, description, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (projectError) throw projectError;

  const selectedProjectId = params?.project ?? projects?.[0]?.id ?? null;
  const selectedProject =
    projects?.find((project) => project.id === selectedProjectId) ?? projects?.[0] ?? null;

  const tasks =
    selectedProjectId === null
      ? []
      : ((
          await supabase
            .from('tasks')
            .select(
              'id, project_id, creator_id, assignee_id, title, body, status, priority, due_at, created_at, updated_at',
            )
            .eq('project_id', selectedProjectId)
            .order('updated_at', { ascending: false })
        ).data ?? []);

  const cacheKey = selectedProjectId ? `metrics:${selectedProjectId}` : 'metrics:none';
  const cachedMetrics = await getJsonCache<ProjectMetrics>(cacheKey);
  const metrics = cachedMetrics ?? calculateMetrics(tasks as Task[]);
  if (!cachedMetrics) await setJsonCache(cacheKey, metrics, 30);

  if (!profile) redirect('/login');

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="muted">{profile.full_name ?? profile.email}</p>
          <h1>Project command center</h1>
        </div>
      </header>
      <ProjectConsole
        initialProjects={(projects ?? []) as Project[]}
        initialSelectedProjectId={selectedProject?.id ?? null}
        initialTasks={tasks as Task[]}
        initialMetrics={metrics}
      />
    </main>
  );
}
