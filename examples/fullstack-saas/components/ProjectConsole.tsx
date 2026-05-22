'use client';

import { ArrowRight, Check, CircleDot, Clock3, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { Project, ProjectMetrics, Task, TaskStatus } from '@/lib/types';

interface ProjectConsoleProps {
  initialProjects: Project[];
  initialSelectedProjectId: string | null;
  initialTasks: Task[];
  initialMetrics: ProjectMetrics;
}

const lanes: Array<{
  status: TaskStatus;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { status: 'todo', label: 'To do', icon: CircleDot },
  { status: 'doing', label: 'Doing', icon: Clock3 },
  { status: 'blocked', label: 'Blocked', icon: TriangleAlert },
  { status: 'done', label: 'Done', icon: Check },
];

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export default function ProjectConsole({
  initialProjects,
  initialSelectedProjectId,
  initialTasks,
  initialMetrics,
}: ProjectConsoleProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialSelectedProjectId,
  );
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [metrics, setMetrics] = useState<ProjectMetrics>(initialMetrics);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const groupedTasks = useMemo(() => {
    return lanes.reduce<Record<TaskStatus, Task[]>>(
      (acc, lane) => {
        acc[lane.status] = tasks.filter((task) => task.status === lane.status);
        return acc;
      },
      { todo: [], doing: [], blocked: [], done: [] },
    );
  }, [tasks]);

  function recalculate(nextTasks: Task[]) {
    setMetrics(
      nextTasks.reduce<ProjectMetrics>(
        (acc, task) => {
          acc.total += 1;
          acc[task.status] += 1;
          return acc;
        },
        { total: 0, todo: 0, doing: 0, blocked: 0, done: 0 },
      ),
    );
  }

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setError(null);
    startTransition(async () => {
      try {
        const data = await parseResponse<{ tasks: Task[]; metrics: ProjectMetrics }>(
          await fetch(`/api/projects/${projectId}/tasks`, { credentials: 'include' }),
        );
        setTasks(data.tasks);
        setMetrics(data.metrics);
        router.replace(`/dashboard?project=${projectId}`);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load project');
      }
    });
  }

  function createProject(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const data = await parseResponse<{ project: Project }>(
          await fetch('/api/projects', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: formData.get('name'),
              description: formData.get('description'),
            }),
          }),
        );
        setProjects((current) => [data.project, ...current]);
        setSelectedProjectId(data.project.id);
        setTasks([]);
        recalculate([]);
        router.replace(`/dashboard?project=${data.project.id}`);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to create project');
      }
    });
  }

  function createTask(formData: FormData) {
    if (!selectedProjectId) return;
    setError(null);
    startTransition(async () => {
      try {
        const data = await parseResponse<{ task: Task }>(
          await fetch(`/api/projects/${selectedProjectId}/tasks`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: formData.get('title'),
              body: formData.get('body'),
              priority: formData.get('priority'),
            }),
          }),
        );
        setTasks((current) => {
          const nextTasks = [data.task, ...current];
          recalculate(nextTasks);
          return nextTasks;
        });
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to create task');
      }
    });
  }

  function updateTask(taskId: string, status: TaskStatus) {
    startTransition(async () => {
      try {
        const data = await parseResponse<{ task: Task }>(
          await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          }),
        );
        setTasks((current) => {
          const nextTasks = current.map((task) => (task.id === taskId ? data.task : task));
          recalculate(nextTasks);
          return nextTasks;
        });
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to update task');
      }
    });
  }

  function deleteTask(taskId: string) {
    startTransition(async () => {
      try {
        await parseResponse<{ ok: true }>(
          await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE',
            credentials: 'include',
          }),
        );
        setTasks((current) => {
          const nextTasks = current.filter((task) => task.id !== taskId);
          recalculate(nextTasks);
          return nextTasks;
        });
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to delete task');
      }
    });
  }

  return (
    <>
      <section className="metrics" aria-label="Task metrics">
        {[
          ['Total', metrics.total],
          ['Todo', metrics.todo],
          ['Doing', metrics.doing],
          ['Blocked', metrics.blocked],
          ['Done', metrics.done],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      {error ? <p role="alert">{error}</p> : null}

      <section className="workspace">
        <aside className="sidebar">
          <form className="form-panel" action={createProject}>
            <label className="field">
              <span>Project name</span>
              <input required name="name" minLength={2} maxLength={80} />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea name="description" rows={3} maxLength={500} />
            </label>
            <button className="button" disabled={isPending} type="submit">
              <Plus size={16} />
              Project
            </button>
          </form>
          {projects.map((project) => (
            <button
              className={`project-button ${project.id === selectedProjectId ? 'active' : ''}`}
              key={project.id}
              onClick={() => selectProject(project.id)}
              type="button"
            >
              <strong>{project.name}</strong>
              <p className="muted">{project.description || 'No description'}</p>
            </button>
          ))}
        </aside>

        <section className="board">
          <form className="form-panel" action={createTask}>
            <label className="field">
              <span>
                {selectedProject
                  ? `New task for ${selectedProject.name}`
                  : 'Create a project first'}
              </span>
              <input
                required
                disabled={!selectedProjectId}
                name="title"
                minLength={2}
                maxLength={160}
              />
            </label>
            <label className="field">
              <span>Details</span>
              <textarea disabled={!selectedProjectId} name="body" rows={3} maxLength={4000} />
            </label>
            <label className="field">
              <span>Priority</span>
              <select disabled={!selectedProjectId} name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <button className="button" disabled={isPending || !selectedProjectId} type="submit">
              <Plus size={16} />
              Task
            </button>
          </form>

          <div className="task-grid">
            {lanes.map((lane, index) => {
              const Icon = lane.icon;
              const nextLane = lanes[index + 1]?.status ?? 'done';
              return (
                <section className="lane" key={lane.status}>
                  <h2>
                    <Icon size={14} /> {lane.label}
                  </h2>
                  {groupedTasks[lane.status].map((task) => (
                    <article className="task" key={task.id}>
                      <strong>{task.title}</strong>
                      {task.body ? <span className="muted">{task.body}</span> : null}
                      <span className="muted">{task.priority}</span>
                      <div className="task-actions">
                        {task.status !== 'done' ? (
                          <button
                            aria-label="Move task forward"
                            onClick={() => updateTask(task.id, nextLane)}
                            type="button"
                          >
                            <ArrowRight size={15} />
                          </button>
                        ) : null}
                        <button
                          aria-label="Delete task"
                          onClick={() => deleteTask(task.id)}
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </section>
      </section>
    </>
  );
}
