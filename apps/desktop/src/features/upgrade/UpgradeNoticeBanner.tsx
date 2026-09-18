import { ArrowUpRight, HardDriveDownload, ShieldCheck } from 'lucide-react';
import type { UpgradeNotice } from './localRuntimeUpgrade';

interface UpgradeNoticeBannerProps {
  notice: UpgradeNotice;
  onAction?: () => void;
}

export function UpgradeNoticeBanner({ notice, onAction }: UpgradeNoticeBannerProps) {
  if (notice.blocking) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center overflow-auto bg-[#080b10] px-6 py-10 text-white"
        aria-labelledby="upgrade-notice-title"
      >
        <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#11161e]/95 p-7 shadow-2xl shadow-black/40 sm:p-10">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]">
            <ShieldCheck className="h-5 w-5 text-cyan-300" aria-hidden="true" />
          </div>
          <h1 id="upgrade-notice-title" className="text-2xl font-semibold tracking-tight">
            {notice.title}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">{notice.body}</p>
          {notice.actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-[#06131a] transition hover:bg-cyan-300"
            >
              {notice.actionLabel}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80"
    >
      <HardDriveDownload className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
      <div>
        <p className="font-medium text-white">{notice.title}</p>
        <p className="mt-1 text-white/60">{notice.body}</p>
      </div>
    </div>
  );
}
