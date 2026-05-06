import type { Metadata } from 'next';
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Mail,
  Clock,
  Server,
  Globe,
  Database,
  Wifi,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'System Status | AGI Workforce',
  description:
    'Current status of AGI Workforce services: web app, API gateway, signaling server, and database. Manual incident log.',
  alternates: { canonical: 'https://agiworkforce.com/status' },
};

const services = [
  {
    name: 'Web App',
    host: 'chat.agiworkforce.com',
    icon: Globe,
    status: 'operational' as const,
  },
  {
    name: 'API Gateway',
    host: 'api.agiworkforce.com (Fly.io)',
    icon: Server,
    status: 'operational' as const,
  },
  {
    name: 'Signaling Server',
    host: 'signaling.fly.dev (Fly.io, us-east)',
    icon: Wifi,
    status: 'operational' as const,
  },
  {
    name: 'Database',
    host: 'Supabase (us-east-2)',
    icon: Database,
    status: 'operational' as const,
  },
];

const statusConfig = {
  operational: {
    label: 'Operational',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-400',
    icon: CheckCircle2,
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-yellow-500',
    textClass: 'text-yellow-400',
    icon: AlertCircle,
  },
  outage: {
    label: 'Outage',
    dotClass: 'bg-red-500',
    textClass: 'text-red-400',
    icon: AlertCircle,
  },
};

export default function StatusPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] text-[#edebe8]">
      <Header />
      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <div className="mb-4 inline-flex items-center rounded-md border border-[#555150]/40 bg-[#555150]/10 px-3 py-1 text-sm text-[#c8892a]">
              <Circle className="mr-2 h-3 w-3 fill-emerald-500 text-emerald-500" />
              All Systems Operational
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-[#edebe8] md:text-5xl">
              AGI Workforce Status
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[#888480]">
              Service status and incident history for AGI Workforce infrastructure.
            </p>
            <p className="mx-auto mt-2 max-w-2xl rounded-md border border-yellow-800/40 bg-yellow-900/10 px-4 py-2 text-sm text-yellow-400">
              This page is currently maintained manually. Automated uptime monitoring is on our
              roadmap.
            </p>
          </div>
        </section>

        {/* Service Status */}
        <section className="py-8">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-6 text-xl font-semibold text-[#edebe8]">Services</h2>
              <div className="space-y-3">
                {services.map((service) => {
                  const cfg = statusConfig[service.status];
                  return (
                    <div
                      key={service.name}
                      className="flex items-center justify-between rounded-xl border border-[#1a1917] bg-black/50 px-6 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <service.icon className="h-5 w-5 text-[#888480]" />
                        <div>
                          <div className="font-medium text-[#edebe8]">{service.name}</div>
                          <div className="text-xs text-[#555150]">{service.host}</div>
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-2 text-sm font-medium ${cfg.textClass}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
                        {cfg.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Incident Log */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#888480]" />
                <h2 className="text-xl font-semibold text-[#edebe8]">Incident History</h2>
              </div>
              <div className="rounded-xl border border-[#1a1917] bg-black/50 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
                <p className="text-[#edebe8]">No incidents reported.</p>
                <p className="mt-1 text-sm text-[#555150]">
                  We will post updates here as soon as any incident is detected or resolved.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Subscribe */}
        <section className="py-12 pb-24">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl rounded-xl border border-[#1a1917] bg-[#0d0d0f] p-8">
              <div className="flex items-center gap-3 mb-4">
                <Mail className="h-5 w-5 text-[#c8892a]" />
                <h2 className="text-lg font-semibold text-[#edebe8]">
                  Subscribe to Status Updates
                </h2>
              </div>
              <p className="mb-4 text-sm text-[#888480]">
                Get notified when incidents are created or resolved. We are rolling out automated
                status updates soon.
              </p>
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={(e) => e.preventDefault()}
              >
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="flex-1 rounded-md border border-[#1a1917] bg-black px-4 py-2.5 text-sm text-[#edebe8] placeholder:text-[#555150] focus:border-[#c8892a]/50 focus:outline-none focus:ring-1 focus:ring-[#c8892a]/30"
                />
                <button
                  type="submit"
                  className="rounded-md bg-[#c8892a] px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[#c8892a]/90"
                >
                  Notify Me
                </button>
              </form>
              <p className="mt-2 text-xs text-[#555150]">
                Automated notifications are not yet active. We will contact you once the system is
                live.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
