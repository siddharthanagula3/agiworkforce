import { GitPullRequest, AlertCircle, GitCommit, MessageSquare } from 'lucide-react';
import type { ToolResultProps } from './index';

export interface GitHubPR {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  html_url: string;
  user?: {
    login: string;
    avatar_url?: string;
  };
  base?: {
    ref: string;
    repo?: {
      name: string;
      owner?: {
        login: string;
      };
    };
  };
  head?: {
    ref: string;
  };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  created_at?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user?: {
    login: string;
    avatar_url?: string;
  };
  labels?: Array<{
    name: string;
    color: string;
  }>;
  comments?: number;
  created_at?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  html_url: string;
  author?: {
    name: string;
    email?: string;
  };
  committer?: {
    date: string;
  };
}

export const InlineGitHubPR: React.FC<ToolResultProps> = ({ result }) => {
  const data = result?.data as GitHubPR | undefined;
  if (!data) return null;

  const { title, number, state, html_url, base, head, additions = 0, deletions = 0, user } = data;

  const stateColor =
    state === 'merged' ? 'text-purple-400' : state === 'open' ? 'text-emerald-400' : 'text-red-400';
  const stateLabel = state === 'merged' ? 'Merged' : state === 'open' ? 'Open' : 'Closed';

  return (
    <a
      href={html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border/50 hover:border-blue-500/30 transition"
    >
      <GitPullRequest className={cn('h-5 w-5 flex-shrink-0 mt-0.5', stateColor)} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm group-hover:text-blue-300 transition">{title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-base text-muted-foreground">
            #{number}
          </span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', stateColor)}>
            {stateLabel}
          </span>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          {base && head && (
            <p>
              {base.ref} ← {head.ref}
            </p>
          )}
          <div className="flex items-center gap-2">
            {additions > 0 && <span className="text-emerald-400">+{additions}</span>}
            {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
            {user && <span>by {user.login}</span>}
          </div>
        </div>
      </div>
    </a>
  );
};

export const InlineGitHubIssue: React.FC<ToolResultProps> = ({ result }) => {
  const data = result?.data as GitHubIssue | undefined;
  if (!data) return null;

  const { title, number, state, html_url, labels = [], comments = 0, user } = data;

  const stateColor = state === 'open' ? 'text-emerald-400' : 'text-red-400';
  const stateLabel = state === 'open' ? 'Open' : 'Closed';

  return (
    <a
      href={html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border/50 hover:border-blue-500/30 transition"
    >
      <AlertCircle className={cn('h-5 w-5 flex-shrink-0 mt-0.5', stateColor)} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-medium text-sm group-hover:text-blue-300 transition">{title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-base text-muted-foreground">
            #{number}
          </span>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', stateColor)}>
            {stateLabel}
          </span>
        </div>

        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {labels.map((label, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: `#${label.color}` }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground space-x-2">
          {comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {comments}
            </span>
          )}
          {user && <span>by {user.login}</span>}
        </div>
      </div>
    </a>
  );
};

export const InlineGitHubCommit: React.FC<ToolResultProps> = ({ result }) => {
  const data = result?.data as GitHubCommit | undefined;
  if (!data) return null;

  const { message, sha, html_url, author } = data;
  const shortSha = sha.substring(0, 7);

  return (
    <a
      href={html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-surface-elevated hover:bg-surface-hover border border-border/50 hover:border-blue-500/30 transition"
    >
      <GitCommit className="h-5 w-5 flex-shrink-0 text-blue-400 mt-0.5" />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm group-hover:text-blue-300 transition line-clamp-2">
          {message.split('\n')[0]}
        </p>

        <div className="text-xs text-muted-foreground mt-1 space-x-2">
          <span className="font-mono">{shortSha}</span>
          {author && <span>by {author.name}</span>}
        </div>
      </div>
    </a>
  );
};

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
