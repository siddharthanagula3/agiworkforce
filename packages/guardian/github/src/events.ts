/**
 * Webhook payload → normalized Guardian event.
 *
 * All payload fields are attacker-influenced (branch names, titles, comment
 * bodies), so parsing is schema-first: unknown or malformed payloads normalize
 * to { kind: 'ignored' } rather than throwing, and free-text fields are
 * length-bounded before they travel further.
 */
import { z } from 'zod';

const RepoSchema = z.object({
  id: z.number().int().nonnegative(),
  full_name: z.string().min(1).max(200),
  default_branch: z.string().min(1).max(200).optional(),
});

const InstallationSchema = z.object({ id: z.number().int().nonnegative() }).optional();

const bounded = (max: number) => z.string().max(max).catch('');

const PushPayloadSchema = z.object({
  ref: z.string().min(1).max(300),
  before: z.string().min(1),
  after: z.string().min(1),
  deleted: z.boolean().optional().default(false),
  repository: RepoSchema,
  installation: InstallationSchema,
});

const PullRequestPayloadSchema = z.object({
  action: z.string().max(50),
  number: z.number().int().positive(),
  repository: RepoSchema,
  installation: InstallationSchema,
  pull_request: z.object({
    number: z.number().int().positive(),
    draft: z.boolean().optional().default(false),
    title: bounded(500),
    base: z.object({ sha: z.string(), ref: z.string().max(300) }),
    head: z.object({
      sha: z.string(),
      ref: z.string().max(300),
      repo: z.object({ id: z.number().int().nonnegative() }).nullable(),
    }),
  }),
});

const IssueCommentPayloadSchema = z.object({
  action: z.string().max(50),
  repository: RepoSchema,
  installation: InstallationSchema,
  comment: z.object({
    id: z.number().int(),
    body: bounded(10_000),
    user: z.object({ login: bounded(200), type: bounded(50) }),
  }),
  issue: z.object({
    number: z.number().int().positive(),
    pull_request: z.object({}).passthrough().optional(),
  }),
});

const MergeGroupPayloadSchema = z.object({
  action: z.string().max(50),
  repository: RepoSchema,
  installation: InstallationSchema,
  merge_group: z.object({ head_sha: z.string(), base_sha: z.string() }),
});

const InstallationPayloadSchema = z.object({
  action: z.string().max(50),
  installation: z.object({ id: z.number().int().nonnegative() }),
});

export const PR_ACTIONS = ['opened', 'reopened', 'synchronize', 'ready_for_review'] as const;

export type NormalizedEvent =
  | {
      kind: 'push';
      repository: string;
      repositoryId: number;
      installationId: number;
      ref: string;
      branch: string | null;
      baseSha: string;
      headSha: string;
      isDelete: boolean;
    }
  | {
      kind: 'pull_request';
      repository: string;
      repositoryId: number;
      installationId: number;
      action: (typeof PR_ACTIONS)[number];
      pullNumber: number;
      isDraft: boolean;
      isFork: boolean;
      baseSha: string;
      headSha: string;
      headRef: string;
    }
  | {
      kind: 'command';
      repository: string;
      repositoryId: number;
      installationId: number;
      pullNumber: number;
      commentId: number;
      actorLogin: string;
      actorIsBot: boolean;
      commandText: string;
    }
  | {
      kind: 'merge_group';
      repository: string;
      repositoryId: number;
      installationId: number;
      baseSha: string;
      headSha: string;
    }
  | { kind: 'installation'; installationId: number; action: string }
  | { kind: 'ignored'; reason: string };

/**
 * Normalize a verified webhook (event name + parsed JSON body).
 * Never throws: malformed payloads become { kind: 'ignored' }.
 */
export function normalizeWebhookEvent(eventName: string | null, payload: unknown): NormalizedEvent {
  switch (eventName) {
    case 'push': {
      const parsed = PushPayloadSchema.safeParse(payload);
      if (!parsed.success) return ignored('malformed push payload');
      const { data } = parsed;
      return {
        kind: 'push',
        repository: data.repository.full_name,
        repositoryId: data.repository.id,
        installationId: data.installation?.id ?? 0,
        ref: data.ref,
        branch: data.ref.startsWith('refs/heads/') ? data.ref.slice('refs/heads/'.length) : null,
        baseSha: data.before,
        headSha: data.after,
        isDelete: data.deleted || /^0{40}$/.test(data.after),
      };
    }
    case 'pull_request': {
      const parsed = PullRequestPayloadSchema.safeParse(payload);
      if (!parsed.success) return ignored('malformed pull_request payload');
      const { data } = parsed;
      const action = PR_ACTIONS.find((a) => a === data.action);
      if (!action) return ignored(`unhandled pull_request action: ${data.action.slice(0, 50)}`);
      return {
        kind: 'pull_request',
        repository: data.repository.full_name,
        repositoryId: data.repository.id,
        installationId: data.installation?.id ?? 0,
        action,
        pullNumber: data.pull_request.number,
        isDraft: data.pull_request.draft,
        isFork:
          data.pull_request.head.repo === null ||
          data.pull_request.head.repo.id !== data.repository.id,
        baseSha: data.pull_request.base.sha,
        headSha: data.pull_request.head.sha,
        headRef: data.pull_request.head.ref,
      };
    }
    case 'issue_comment': {
      const parsed = IssueCommentPayloadSchema.safeParse(payload);
      if (!parsed.success) return ignored('malformed issue_comment payload');
      const { data } = parsed;
      if (data.action !== 'created') return ignored('issue_comment action is not created');
      if (!data.issue.pull_request) return ignored('comment is not on a pull request');
      const body = data.comment.body.trim();
      if (!body.startsWith('/agi')) return ignored('not an /agi command');
      return {
        kind: 'command',
        repository: data.repository.full_name,
        repositoryId: data.repository.id,
        installationId: data.installation?.id ?? 0,
        pullNumber: data.issue.number,
        commentId: data.comment.id,
        actorLogin: data.comment.user.login,
        actorIsBot: data.comment.user.type === 'Bot',
        commandText: body,
      };
    }
    case 'merge_group': {
      const parsed = MergeGroupPayloadSchema.safeParse(payload);
      if (!parsed.success) return ignored('malformed merge_group payload');
      if (parsed.data.action !== 'checks_requested') return ignored('unhandled merge_group action');
      return {
        kind: 'merge_group',
        repository: parsed.data.repository.full_name,
        repositoryId: parsed.data.repository.id,
        installationId: parsed.data.installation?.id ?? 0,
        baseSha: parsed.data.merge_group.base_sha,
        headSha: parsed.data.merge_group.head_sha,
      };
    }
    case 'installation':
    case 'installation_repositories': {
      const parsed = InstallationPayloadSchema.safeParse(payload);
      if (!parsed.success) return ignored('malformed installation payload');
      return {
        kind: 'installation',
        installationId: parsed.data.installation.id,
        action: parsed.data.action,
      };
    }
    default:
      return ignored(`unhandled event: ${(eventName ?? 'null').slice(0, 50)}`);
  }
}

function ignored(reason: string): NormalizedEvent {
  return { kind: 'ignored', reason };
}

/**
 * Stale-run guard: a run for headSha may publish only while headSha is still
 * the current head of its PR/branch.
 */
export function shouldPublish(runHeadSha: string, currentHeadSha: string): boolean {
  return runHeadSha === currentHeadSha;
}
