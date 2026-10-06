import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DocsShell } from '@/features/docs/components/DocsShell';
import { buildMetadata } from '@/lib/seo/metadata';
import { readTopicParam, resolveDocTopic } from '@/lib/support/doc-topics';
import { helpArticlePath } from '@/lib/support/help-paths';
import { documentationIndex } from './doc-index';

export const metadata = buildMetadata({
  title: 'Documentation',
  description:
    'Reference for every AGI surface: CLI, Desktop, Mobile, Web, Chrome, and VS Code extension.',
  path: '/docs',
});

const SURFACE_GUIDES = [
  {
    href: '/get-started',
    title: 'Start with AGI',
    body: 'Choose a route, sign in, and understand what follows your account and what stays on your device.',
  },
  {
    href: '/web',
    title: 'Web',
    body: 'Managed chat, projects, artifacts, memory, cited research, connected tools, and account settings.',
  },
  {
    href: '/mobile',
    title: 'Mobile',
    body: 'The planned iPhone and Android clients, including Cloud continuity and device-local work.',
  },
  {
    href: '/desktop',
    title: 'Desktop',
    body: 'The planned macOS app for Managed Cloud, approved folders, computer use, voice, and the trusted local host.',
  },
  {
    href: '/chrome-extension',
    title: 'Chrome',
    body: 'The planned browser side panel for page context and approvals. Answers come back from AGI Managed Cloud; pairing Desktop is an optional local road for approved handoffs.',
  },
  {
    href: '/cli',
    title: 'CLI',
    body: 'The Rust-native local developer agent for sessions, tools, diffs, reviews, sandboxed execution, and hooks.',
  },
  {
    href: '/vscode-extension',
    title: 'VS Code',
    body: 'The planned IDE client over the same host-owned developer sessions, tools, permissions, and files as the CLI.',
  },
] as const;

const REFERENCE_GUIDES = [
  {
    href: '/api-docs',
    title: 'API reference',
    body: 'OpenAI-compatible endpoints, authentication, request shapes, and response contracts.',
  },
  {
    href: '/providers',
    title: 'Providers and models',
    body: 'The current catalogue, provider routes, capability labels, and availability information.',
  },
  {
    href: '/integrations',
    title: 'Tools and integrations',
    body: 'Connected apps, MCP tools, plugins, and the trust boundary around every route.',
  },
  {
    href: '/local',
    title: 'Local mode',
    body: 'What stays on the device, which surfaces can run locally, and how an explicit handoff works.',
  },
  {
    href: '/byok',
    title: 'Bring your own key',
    body: 'Where BYOK is available, how provider credentials are stored, and what never enters account sync.',
  },
  {
    href: '/security',
    title: 'Security and trust',
    body: 'Isolation, approvals, data handling, retention, deletion, and the limits of current claims.',
  },
] as const;

const START_HERE = [
  {
    href: helpArticlePath('getting-started'),
    title: 'Getting started',
    body: 'Create an account, send a first message and find your way around.',
  },
  {
    href: '/get-started',
    title: 'Choose a route',
    body: 'Sign in, pick where work runs, and see what follows your account.',
  },
  {
    href: '/api-docs',
    title: 'API reference',
    body: 'OpenAI-compatible endpoints, authentication and response contracts.',
  },
] as const;

type Guide = { href: string; title: string; body: string };

function GuideCards({ guides, columns }: { guides: readonly Guide[]; columns: 2 | 3 }) {
  return (
    <div className="dx-cards" data-cols={columns}>
      {guides.map((guide) => (
        <Link key={guide.href} href={guide.href} className="dx-card">
          <span className="dx-card-title">{guide.title}</span>{' '}
          <span className="dx-card-body">{guide.body}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  const topic = readTopicParam((await searchParams).topic);
  const topicPath = topic ? resolveDocTopic(topic) : null;
  if (topicPath) redirect(topicPath);
  const { groups, documentCount, newestUpdate } = documentationIndex();

  return (
    <DocsShell>
      <h1 className="dx-title" id="agi-docs-title">
        Documentation
      </h1>
      <p className="dx-desc">
        Guides and reference for every AGI surface. Each guide states the surfaces and plans it
        applies to.
      </p>

      {topic ? (
        <section className="dx-section" aria-labelledby="agi-docs-topic-title">
          <h2 className="dx-h2" id="agi-docs-topic-title">
            {`No guide covers “${topic.replace(/-/g, ' ')}” yet.`}
          </h2>
          <p className="dx-section-note">
            Every guide we have is listed below.{' '}
            <Link href={`/help?q=${encodeURIComponent(topic.replace(/-/g, ' '))}`}>
              Search the help centre for it
            </Link>{' '}
            to find the closest answer.
          </p>
        </section>
      ) : null}

      <section className="dx-section" aria-labelledby="agi-docs-start-title">
        <h2 className="dx-h2" id="agi-docs-start-title">
          Start here
        </h2>
        <GuideCards guides={START_HERE} columns={3} />
      </section>

      <section className="dx-section" aria-labelledby="agi-docs-surfaces-title">
        <h2 className="dx-h2" id="agi-docs-surfaces-title">
          Guides by surface
        </h2>
        <p className="dx-section-note">
          The website is the active launch surface. The remaining guides describe the current
          implementation and release state without presenting planned clients as published.
        </p>
        <GuideCards guides={SURFACE_GUIDES} columns={2} />
      </section>

      <section className="dx-section" aria-labelledby="agi-docs-reference-title">
        <h2 className="dx-h2" id="agi-docs-reference-title">
          Reference
        </h2>
        <GuideCards guides={REFERENCE_GUIDES} columns={2} />
      </section>

      <section className="dx-section" aria-labelledby="agi-docs-index-title">
        <h2 className="dx-h2" id="agi-docs-index-title">
          Browse by topic
        </h2>
        {groups.length > 0 ? (
          <>
            <p className="dx-section-note">
              {`${documentCount} guides${newestUpdate ? `. Most recent update: ${newestUpdate}` : ''}.`}
            </p>
            <div className="dx-topics">
              {groups.map((group) => (
                <div key={group.id} className="dx-topic">
                  <h3 className="dx-topic-title">{group.label}</h3>
                  <ul className="dx-topic-list">
                    {group.entries.map((entry) => (
                      <li key={entry.docId}>
                        <Link href={entry.href}>{entry.title}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="dx-section-note">
            The documentation index is not loading right now. The surface and reference guides above
            still work, and the help centre reaches the same support material.
          </p>
        )}
      </section>
    </DocsShell>
  );
}
