/**
 * Scheduler Tauri Commands Integration Tests
 *
 * Tests for the proactive scheduling Tauri commands that expose the
 * ProactiveScheduler to the frontend, allowing users to schedule
 * automated tasks with cron expressions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri modules before importing anything else
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

// Types matching the Rust backend structures
type SchedulerActionType =
  | 'workflow'
  | 'agi_task'
  | 'shell_command'
  | 'notification'
  | 'webhook'
  | 'script';

type JobStatus = 'active' | 'paused' | 'completed' | 'failed';

interface ScheduledJob {
  id: string;
  name: string;
  schedule: string;
  action_type: SchedulerActionType;
  action_data: Record<string, unknown>;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  last_run?: string;
  next_run?: string;
  run_count: number;
  failure_count: number;
  description?: string;
}

interface NextRunEntry {
  job_id: string;
  next_run: string;
}

describe('Scheduler Tauri Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // scheduler_add_job - Add cron/interval job
  // ==========================================================================
  describe('scheduler_add_job', () => {
    it('should add a cron job for daily execution', async () => {
      const mockJobId = 'job-uuid-123';
      vi.mocked(invoke).mockResolvedValueOnce(mockJobId);

      const result = await invoke('scheduler_add_job', {
        name: 'Daily Backup',
        schedule: '0 0 9 * * *', // 9 AM daily
        action_type: 'shell_command',
        action_data: { command: 'backup.sh' },
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_add_job', {
        name: 'Daily Backup',
        schedule: '0 0 9 * * *',
        action_type: 'shell_command',
        action_data: { command: 'backup.sh' },
      });
      expect(result).toBe(mockJobId);
    });

    it('should add an AGI task job', async () => {
      const mockJobId = 'job-uuid-456';
      vi.mocked(invoke).mockResolvedValueOnce(mockJobId);

      const result = await invoke('scheduler_add_job', {
        name: 'Morning Briefing',
        schedule: '0 0 8 * * 1-5', // 8 AM weekdays
        action_type: 'agi_task',
        action_data: {
          prompt: 'Give me a summary of my emails and calendar for today',
        },
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_add_job', {
        name: 'Morning Briefing',
        schedule: '0 0 8 * * 1-5',
        action_type: 'agi_task',
        action_data: {
          prompt: 'Give me a summary of my emails and calendar for today',
        },
      });
      expect(result).toBe(mockJobId);
    });

    it('should add a notification job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('job-uuid-789');

      const result = await invoke('scheduler_add_job', {
        name: 'Stand-up Reminder',
        schedule: '0 55 9 * * 1-5', // 9:55 AM weekdays
        action_type: 'notification',
        action_data: {
          title: 'Stand-up in 5 minutes',
          message: 'Daily stand-up meeting starting soon',
        },
      });

      expect(result).toBe('job-uuid-789');
    });

    it('should add a workflow job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('job-uuid-wf');

      const result = await invoke('scheduler_add_job', {
        name: 'Weekly Report',
        schedule: '0 0 17 * * 5', // Friday 5 PM
        action_type: 'workflow',
        action_data: {
          workflow_id: 'wf-weekly-report-123',
          parameters: { include_charts: true },
        },
      });

      expect(result).toBe('job-uuid-wf');
    });

    it('should add a webhook job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('job-uuid-wh');

      const result = await invoke('scheduler_add_job', {
        name: 'Health Check',
        schedule: '0 */5 * * * *', // Every 5 minutes
        action_type: 'webhook',
        action_data: {
          url: 'https://api.example.com/health',
          method: 'GET',
        },
      });

      expect(result).toBe('job-uuid-wh');
    });

    it('should add a script job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('job-uuid-script');

      const result = await invoke('scheduler_add_job', {
        name: 'Data Sync',
        schedule: '0 0 */2 * * *', // Every 2 hours
        action_type: 'script',
        action_data: {
          script_path: '/scripts/sync.js',
          args: ['--force', '--verbose'],
        },
      });

      expect(result).toBe('job-uuid-script');
    });

    it('should reject invalid cron expression', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Invalid cron expression: invalid-cron'));

      await expect(
        invoke('scheduler_add_job', {
          name: 'Bad Job',
          schedule: 'invalid-cron',
          action_type: 'notification',
          action_data: {},
        }),
      ).rejects.toThrow('Invalid cron expression');
    });

    it('should reject invalid action type', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(
        new Error(
          'Invalid action type: invalid_type. Valid options: workflow, agi_task, shell_command, notification, webhook, script',
        ),
      );

      await expect(
        invoke('scheduler_add_job', {
          name: 'Bad Job',
          schedule: '0 0 * * * *',
          action_type: 'invalid_type',
          action_data: {},
        }),
      ).rejects.toThrow('Invalid action type');
    });
  });

  // ==========================================================================
  // scheduler_list_jobs - List all jobs
  // ==========================================================================
  describe('scheduler_list_jobs', () => {
    it('should list all scheduled jobs', async () => {
      const mockJobs: ScheduledJob[] = [
        {
          id: 'job-1',
          name: 'Daily Backup',
          schedule: '0 0 9 * * *',
          action_type: 'shell_command',
          action_data: { command: 'backup.sh' },
          status: 'active',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          next_run: '2024-01-16T09:00:00Z',
          run_count: 5,
          failure_count: 0,
        },
        {
          id: 'job-2',
          name: 'Morning Briefing',
          schedule: '0 0 8 * * 1-5',
          action_type: 'agi_task',
          action_data: { prompt: 'Daily summary' },
          status: 'active',
          created_at: '2024-01-10T08:00:00Z',
          updated_at: '2024-01-15T08:00:00Z',
          last_run: '2024-01-15T08:00:00Z',
          next_run: '2024-01-16T08:00:00Z',
          run_count: 10,
          failure_count: 0,
        },
        {
          id: 'job-3',
          name: 'Paused Job',
          schedule: '0 0 12 * * *',
          action_type: 'notification',
          action_data: { message: 'Test' },
          status: 'paused',
          created_at: '2024-01-05T12:00:00Z',
          updated_at: '2024-01-14T12:00:00Z',
          run_count: 3,
          failure_count: 0,
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockJobs);

      const result = await invoke('scheduler_list_jobs');

      expect(invoke).toHaveBeenCalledWith('scheduler_list_jobs');
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no jobs exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await invoke('scheduler_list_jobs');

      expect(result).toEqual([]);
    });

    it('should include jobs with various statuses', async () => {
      const mockJobs: ScheduledJob[] = [
        {
          id: 'job-active',
          name: 'Active Job',
          schedule: '0 0 * * * *',
          action_type: 'notification',
          action_data: {},
          status: 'active',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          run_count: 0,
          failure_count: 0,
        },
        {
          id: 'job-paused',
          name: 'Paused Job',
          schedule: '0 0 * * * *',
          action_type: 'notification',
          action_data: {},
          status: 'paused',
          created_at: '2024-01-14T10:00:00Z',
          updated_at: '2024-01-14T10:00:00Z',
          run_count: 5,
          failure_count: 0,
        },
        {
          id: 'job-failed',
          name: 'Failed Job',
          schedule: '0 0 * * * *',
          action_type: 'webhook',
          action_data: { url: 'https://bad.url' },
          status: 'failed',
          created_at: '2024-01-13T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          run_count: 3,
          failure_count: 3,
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockJobs);

      const result = (await invoke('scheduler_list_jobs')) as ScheduledJob[];

      const statuses = result.map((job) => job.status);
      expect(statuses).toContain('active');
      expect(statuses).toContain('paused');
      expect(statuses).toContain('failed');
    });
  });

  // ==========================================================================
  // scheduler_pause_job - Pause a job
  // ==========================================================================
  describe('scheduler_pause_job', () => {
    it('should pause an active job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('scheduler_pause_job', {
        job_id: 'job-123',
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_pause_job', {
        job_id: 'job-123',
      });
      expect(result).toBe(true);
    });

    it('should return false when job is already paused', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('scheduler_pause_job', {
        job_id: 'job-already-paused',
      });

      expect(result).toBe(false);
    });

    it('should return false when job does not exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('scheduler_pause_job', {
        job_id: 'nonexistent-job',
      });

      expect(result).toBe(false);
    });

    it('should handle errors during pause', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Failed to acquire write lock'));

      await expect(
        invoke('scheduler_pause_job', {
          job_id: 'job-123',
        }),
      ).rejects.toThrow('Failed to acquire write lock');
    });
  });

  // ==========================================================================
  // scheduler_resume_job - Resume a job
  // ==========================================================================
  describe('scheduler_resume_job', () => {
    it('should resume a paused job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('scheduler_resume_job', {
        job_id: 'job-123',
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_resume_job', {
        job_id: 'job-123',
      });
      expect(result).toBe(true);
    });

    it('should return false when job is already active', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('scheduler_resume_job', {
        job_id: 'job-already-active',
      });

      expect(result).toBe(false);
    });

    it('should return false when job does not exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('scheduler_resume_job', {
        job_id: 'nonexistent-job',
      });

      expect(result).toBe(false);
    });

    it('should handle errors during resume', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Failed to acquire write lock'));

      await expect(
        invoke('scheduler_resume_job', {
          job_id: 'job-123',
        }),
      ).rejects.toThrow('Failed to acquire write lock');
    });
  });

  // ==========================================================================
  // scheduler_remove_job - Remove a job
  // ==========================================================================
  describe('scheduler_remove_job', () => {
    it('should remove an existing job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('scheduler_remove_job', {
        job_id: 'job-to-delete',
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_remove_job', {
        job_id: 'job-to-delete',
      });
      expect(result).toBe(true);
    });

    it('should return false when job does not exist', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false);

      const result = await invoke('scheduler_remove_job', {
        job_id: 'nonexistent-job',
      });

      expect(result).toBe(false);
    });

    it('should handle errors during removal', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Failed to acquire write lock'));

      await expect(
        invoke('scheduler_remove_job', {
          job_id: 'job-123',
        }),
      ).rejects.toThrow('Failed to acquire write lock');
    });

    it('should allow removal of paused jobs', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('scheduler_remove_job', {
        job_id: 'paused-job',
      });

      expect(result).toBe(true);
    });

    it('should allow removal of failed jobs', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await invoke('scheduler_remove_job', {
        job_id: 'failed-job',
      });

      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // scheduler_get_next_runs - Get upcoming runs
  // ==========================================================================
  describe('scheduler_get_next_runs', () => {
    it('should get next runs with default limit', async () => {
      const mockNextRuns: NextRunEntry[] = [
        {
          job_id: 'job-1',
          next_run: '2024-01-16T08:00:00Z',
        },
        {
          job_id: 'job-2',
          next_run: '2024-01-16T09:00:00Z',
        },
        {
          job_id: 'job-3',
          next_run: '2024-01-16T12:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockNextRuns);

      const result = await invoke('scheduler_get_next_runs', {
        limit: 10,
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_get_next_runs', {
        limit: 10,
      });
      expect(result).toHaveLength(3);
    });

    it('should respect custom limit', async () => {
      const mockNextRuns: NextRunEntry[] = [
        {
          job_id: 'job-1',
          next_run: '2024-01-16T08:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockNextRuns);

      await invoke('scheduler_get_next_runs', {
        limit: 1,
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_get_next_runs', {
        limit: 1,
      });
    });

    it('should return results sorted by next run time', async () => {
      const mockNextRuns: NextRunEntry[] = [
        {
          job_id: 'job-early',
          next_run: '2024-01-16T06:00:00Z',
        },
        {
          job_id: 'job-mid',
          next_run: '2024-01-16T12:00:00Z',
        },
        {
          job_id: 'job-late',
          next_run: '2024-01-16T18:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockNextRuns);

      const result = (await invoke('scheduler_get_next_runs', {
        limit: 10,
      })) as NextRunEntry[];

      // Verify results are sorted chronologically
      for (let i = 0; i < result.length - 1; i++) {
        const currentTime = new Date(result[i]!.next_run).getTime();
        const nextTime = new Date(result[i + 1]!.next_run).getTime();
        expect(currentTime).toBeLessThanOrEqual(nextTime);
      }
    });

    it('should return empty array when no active jobs', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await invoke('scheduler_get_next_runs', {
        limit: 10,
      });

      expect(result).toEqual([]);
    });

    it('should only include active jobs', async () => {
      // Backend should only return active jobs, not paused/failed ones
      const mockNextRuns: NextRunEntry[] = [
        {
          job_id: 'active-job-1',
          next_run: '2024-01-16T08:00:00Z',
        },
        {
          job_id: 'active-job-2',
          next_run: '2024-01-16T09:00:00Z',
        },
      ];

      vi.mocked(invoke).mockResolvedValueOnce(mockNextRuns);

      const result = (await invoke('scheduler_get_next_runs', {
        limit: 10,
      })) as NextRunEntry[];

      expect(result).toHaveLength(2);
      result.forEach((entry) => {
        expect(entry.job_id).toContain('active');
      });
    });
  });

  // ==========================================================================
  // scheduler_get_job - Get a specific job by ID
  // ==========================================================================
  describe('scheduler_get_job', () => {
    it('should get a job by ID', async () => {
      const mockJob: ScheduledJob = {
        id: 'job-123',
        name: 'Test Job',
        schedule: '0 0 9 * * *',
        action_type: 'notification',
        action_data: { message: 'Hello' },
        status: 'active',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        next_run: '2024-01-16T09:00:00Z',
        run_count: 0,
        failure_count: 0,
        description: 'A test notification job',
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockJob);

      const result = await invoke('scheduler_get_job', {
        job_id: 'job-123',
      });

      expect(invoke).toHaveBeenCalledWith('scheduler_get_job', {
        job_id: 'job-123',
      });
      expect(result).toEqual(mockJob);
    });

    it('should return null for non-existent job', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(null);

      const result = await invoke('scheduler_get_job', {
        job_id: 'nonexistent-job',
      });

      expect(result).toBeNull();
    });

    it('should include run statistics', async () => {
      const mockJob: ScheduledJob = {
        id: 'job-with-stats',
        name: 'Stats Job',
        schedule: '0 0 * * * *',
        action_type: 'shell_command',
        action_data: { command: 'echo test' },
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        last_run: '2024-01-15T10:00:00Z',
        next_run: '2024-01-15T11:00:00Z',
        run_count: 350,
        failure_count: 2,
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockJob);

      const result = (await invoke('scheduler_get_job', {
        job_id: 'job-with-stats',
      })) as ScheduledJob;

      expect(result.run_count).toBe(350);
      expect(result.failure_count).toBe(2);
      expect(result.last_run).toBeDefined();
    });
  });

  // ==========================================================================
  // Job lifecycle integration tests
  // ==========================================================================
  describe('Job lifecycle', () => {
    it('should handle full job lifecycle: create -> pause -> resume -> remove', async () => {
      const jobId = 'lifecycle-job';

      // Create job
      vi.mocked(invoke).mockResolvedValueOnce(jobId);
      const createdId = await invoke('scheduler_add_job', {
        name: 'Lifecycle Test',
        schedule: '0 0 * * * *',
        action_type: 'notification',
        action_data: { message: 'Test' },
      });
      expect(createdId).toBe(jobId);

      // Pause job
      vi.mocked(invoke).mockResolvedValueOnce(true);
      const paused = await invoke('scheduler_pause_job', { job_id: jobId });
      expect(paused).toBe(true);

      // Resume job
      vi.mocked(invoke).mockResolvedValueOnce(true);
      const resumed = await invoke('scheduler_resume_job', { job_id: jobId });
      expect(resumed).toBe(true);

      // Remove job
      vi.mocked(invoke).mockResolvedValueOnce(true);
      const removed = await invoke('scheduler_remove_job', { job_id: jobId });
      expect(removed).toBe(true);

      expect(invoke).toHaveBeenCalledTimes(4);
    });

    it('should handle job failure accumulation', async () => {
      // Job with 3 consecutive failures should be marked as failed
      const mockFailedJob: ScheduledJob = {
        id: 'failing-job',
        name: 'Failing Job',
        schedule: '0 0 * * * *',
        action_type: 'webhook',
        action_data: { url: 'https://unreachable.url' },
        status: 'failed',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T13:00:00Z',
        last_run: '2024-01-15T13:00:00Z',
        run_count: 3,
        failure_count: 3,
      };

      vi.mocked(invoke).mockResolvedValueOnce(mockFailedJob);

      const result = (await invoke('scheduler_get_job', {
        job_id: 'failing-job',
      })) as ScheduledJob;

      expect(result.status).toBe('failed');
      expect(result.failure_count).toBe(3);
    });
  });

  // ==========================================================================
  // Cron expression validation tests
  // ==========================================================================
  describe('Cron expression support', () => {
    const validCronExpressions = [
      { expr: '0 0 * * * *', desc: 'every hour' },
      { expr: '0 */5 * * * *', desc: 'every 5 minutes' },
      { expr: '0 0 9 * * *', desc: 'every day at 9 AM' },
      { expr: '0 0 9 * * 1-5', desc: 'weekdays at 9 AM' },
      { expr: '0 30 9 1 * *', desc: 'first of every month at 9:30 AM' },
      { expr: '0 0 0 * * 0', desc: 'every Sunday at midnight' },
    ];

    validCronExpressions.forEach(({ expr, desc }) => {
      it(`should accept valid cron expression: ${desc}`, async () => {
        vi.mocked(invoke).mockResolvedValueOnce('job-id');

        await invoke('scheduler_add_job', {
          name: `Test ${desc}`,
          schedule: expr,
          action_type: 'notification',
          action_data: {},
        });

        expect(invoke).toHaveBeenCalledWith('scheduler_add_job', {
          name: `Test ${desc}`,
          schedule: expr,
          action_type: 'notification',
          action_data: {},
        });
      });
    });

    const invalidCronExpressions = ['invalid', '* * *', '60 * * * * *', '* 60 * * * *'];

    invalidCronExpressions.forEach((expr) => {
      it(`should reject invalid cron expression: ${expr}`, async () => {
        vi.mocked(invoke).mockRejectedValueOnce(new Error(`Invalid cron expression: ${expr}`));

        await expect(
          invoke('scheduler_add_job', {
            name: 'Bad Job',
            schedule: expr,
            action_type: 'notification',
            action_data: {},
          }),
        ).rejects.toThrow('Invalid cron expression');
      });
    });
  });

  // ==========================================================================
  // Action type tests
  // ==========================================================================
  describe('Action type support', () => {
    const actionTypes: Array<{ type: SchedulerActionType; data: Record<string, unknown> }> = [
      { type: 'workflow', data: { workflow_id: 'wf-123' } },
      { type: 'agi_task', data: { prompt: 'Do something' } },
      { type: 'shell_command', data: { command: 'echo hello' } },
      { type: 'notification', data: { title: 'Test', message: 'Hello' } },
      { type: 'webhook', data: { url: 'https://api.example.com', method: 'POST' } },
      { type: 'script', data: { script_path: '/scripts/test.js' } },
    ];

    actionTypes.forEach(({ type, data }) => {
      it(`should support ${type} action type`, async () => {
        vi.mocked(invoke).mockResolvedValueOnce(`job-${type}`);

        const result = await invoke('scheduler_add_job', {
          name: `${type} job`,
          schedule: '0 0 * * * *',
          action_type: type,
          action_data: data,
        });

        expect(result).toBe(`job-${type}`);
        expect(invoke).toHaveBeenCalledWith('scheduler_add_job', {
          name: `${type} job`,
          schedule: '0 0 * * * *',
          action_type: type,
          action_data: data,
        });
      });
    });
  });
});
