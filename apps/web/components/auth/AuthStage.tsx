import type { ReactNode } from 'react';
import { FileSpreadsheet, BarChart3, Monitor, CalendarCheck, FolderOpen, Mail } from 'lucide-react';

type AuthStageProps = {
  children: ReactNode;
  mode: 'login' | 'signup';
};

const PREVIEW_CARDS = [
  { label: 'Create a file', icon: FileSpreadsheet },
  { label: 'Crunch data', icon: BarChart3 },
  { label: 'Make a prototype', icon: Monitor },
  { label: 'Prep for the day', icon: CalendarCheck },
  { label: 'Organize files', icon: FolderOpen },
  { label: 'Send a message', icon: Mail },
];

export function AuthStage({ children, mode }: AuthStageProps) {
  const isLogin = mode === 'login';

  return (
    <section
      className="flex min-h-[80vh] w-full items-center justify-center gap-0 px-6 py-12 md:gap-12 lg:gap-20"
      aria-labelledby="auth-stage-title"
    >
      {/* Left: headline + auth form */}
      <div className="flex w-full max-w-[420px] flex-col items-center text-center md:items-start md:text-left">
        <h1
          id="auth-stage-title"
          className="mb-3 text-[40px] leading-[1.15] font-normal tracking-tight md:text-[48px]"
          style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
        >
          Think fast,
          <br />
          build faster
        </h1>

        <p className="mb-8 text-[15px] text-muted-foreground">
          {isLogin
            ? 'Chat with any AI, build with all of them'
            : 'Create your workspace to get started'}
        </p>

        <div className="w-full max-w-[400px]">{children}</div>

        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
            <path d="M8 12l2 2 4-4" />
          </svg>
          Download desktop app
        </div>
      </div>

      {/* Right: chat UI preview mockup */}
      <div className="hidden w-full max-w-[480px] md:block">
        <div
          className="rounded-2xl border p-6"
          style={{
            borderColor: 'rgba(0,0,0,0.08)',
            background: 'rgba(255,255,255,0.6)',
          }}
        >
          {/* Suggestion cards grid */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {PREVIEW_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] text-muted-foreground"
                  style={{
                    borderColor: 'rgba(0,0,0,0.08)',
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-50" />
                  {card.label}
                </div>
              );
            })}
          </div>

          {/* Sample prompt bar */}
          <div
            className="flex items-center justify-between rounded-xl border px-4 py-3"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            <div>
              <p className="text-sm text-foreground">Summarize this research into a presentation</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
                  style={{ borderColor: 'rgba(0,0,0,0.1)' }}
                >
                  <FolderOpen className="h-3 w-3" />
                  Q2 UX Research
                </span>
                <span className="text-xs text-muted-foreground">+</span>
              </div>
            </div>
            <button
              className="rounded-full px-4 py-1.5 text-sm font-medium text-white"
              style={{ background: 'var(--chat-accent-primary, #c8892a)' }}
              tabIndex={-1}
              aria-hidden="true"
            >
              Let&apos;s go &rarr;
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
