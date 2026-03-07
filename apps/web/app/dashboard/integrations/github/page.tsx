'use client';

import { useEffect, useState, useCallback } from 'react';
import { Github, CheckCircle2, AlertCircle } from 'lucide-react';

interface Installation {
  id: string;
  installation_id: number;
  account_login: string;
  account_type: string;
  pr_review_enabled: boolean;
  review_model: string;
  created_at: string;
}

export default function GitHubIntegrationPage() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/github/installations')
      .then((r) => r.json())
      .then((d: { installations?: Installation[] }) => setInstallations(d.installations ?? []))
      .catch(() => setInstallations([]))
      .finally(() => setLoading(false));
  }, []);

  const disconnect = useCallback(async (installationId: number) => {
    setDisconnecting(installationId);
    try {
      await fetch('/api/github/installations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId }),
      });
      setInstallations((prev) => prev.filter((i) => i.installation_id !== installationId));
    } finally {
      setDisconnecting(null);
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Github className="h-8 w-8 text-white" />
        <div>
          <h1 className="text-xl font-bold text-white">GitHub Integration</h1>
          <p className="text-sm text-gray-400">Automated PR review via @agi-workforce mention</p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : installations.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-2 font-semibold text-white">Connect GitHub</h2>
          <p className="mb-4 text-sm text-gray-400">
            Install the AGI Workforce GitHub App to enable automated code review on your pull
            requests. Mention{' '}
            <code className="rounded bg-white/10 px-1 font-mono">@agi-workforce</code> in any PR
            comment to trigger a review.
          </p>
          <a
            href="https://github.com/apps/agi-workforce/installations/new"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <Github className="h-4 w-4" />
            Install GitHub App
          </a>
        </div>
      ) : (
        installations.map((inst) => (
          <div key={inst.id} className="rounded-xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <div>
                  <p className="font-medium text-white">{inst.account_login}</p>
                  <p className="text-xs text-gray-400">
                    {inst.account_type} · Connected {new Date(inst.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => disconnect(inst.installation_id)}
                disabled={disconnecting === inst.installation_id}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
              >
                {disconnecting === inst.installation_id ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        ))
      )}

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            PR reviews use your AGI Workforce subscription quota. Hobby plan users will receive an
            upgrade prompt.
          </p>
        </div>
      </div>
    </div>
  );
}
