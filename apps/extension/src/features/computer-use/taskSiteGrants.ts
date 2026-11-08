import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';
import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { ONE_TIME_SITE_GRANT_MAX_MS } from './oneTimeSiteGrants';

export interface BrowserTaskGrantContext {
  streamId: string;
  generation: number;
  owner: ManagedCloudOwner;
}

export interface BrowserTaskSiteGrant {
  origin: string;
  tabId: number;
  scope: 'read' | 'act';
  grantId?: string;
  release: () => Promise<void>;
}

interface HeldGrant extends BrowserTaskSiteGrant {
  context: BrowserTaskGrantContext;
  expiresAtMs: number;
  timer: ReturnType<typeof setTimeout>;
}

export class BrowserTaskSiteGrants {
  private held = new Set<HeldGrant>();
  private cleanup: Promise<void> = Promise.resolve();

  settled(): Promise<void> {
    return this.cleanup;
  }

  async get(
    context: BrowserTaskGrantContext,
    origin: string,
    tabId: number,
    scope: 'read' | 'act',
  ): Promise<BrowserTaskSiteGrant | null> {
    await this.releaseWhere(
      (grant) =>
        grant.expiresAtMs <= Date.now() ||
        grant.context.generation !== context.generation ||
        !sameManagedCloudOwner(grant.context.owner, context.owner),
    );
    return (
      [...this.held].find(
        (grant) =>
          grant.context.streamId === context.streamId &&
          grant.origin === origin &&
          grant.tabId === tabId &&
          (scope === 'read' || grant.scope === 'act'),
      ) ?? null
    );
  }

  retain(context: BrowserTaskGrantContext, grant: BrowserTaskSiteGrant): void {
    const held: HeldGrant = {
      ...grant,
      context: { ...context, owner: { ...context.owner } },
      expiresAtMs: Date.now() + ONE_TIME_SITE_GRANT_MAX_MS,
      timer: setTimeout(
        () => void this.releaseWhere((entry) => entry === held),
        ONE_TIME_SITE_GRANT_MAX_MS,
      ),
    };
    this.held.add(held);
  }

  releaseTask(streamId?: string): Promise<void> {
    return this.releaseWhere(
      (grant) => streamId === undefined || grant.context.streamId === streamId,
    );
  }

  releaseTab(tabId: number, url?: string): Promise<void> {
    const origin = url === undefined ? null : normalizeApprovedSiteOrigin(url);
    return this.releaseWhere((grant) => grant.tabId === tabId && grant.origin !== origin);
  }

  releaseGrant(grant: BrowserTaskSiteGrant): Promise<void> {
    return this.releaseWhere((held) => held === grant);
  }

  discard(release: () => Promise<void>): Promise<void> {
    this.cleanup = this.cleanup.then(async () => {
      await Promise.allSettled([Promise.resolve().then(release)]);
    });
    return this.cleanup;
  }

  private releaseWhere(matches: (grant: HeldGrant) => boolean): Promise<void> {
    const removed = [...this.held].filter(matches);
    for (const grant of removed) {
      this.held.delete(grant);
      clearTimeout(grant.timer);
    }
    if (removed.length === 0) return this.cleanup;
    return this.discard(async () => {
      await Promise.allSettled(removed.map(async (grant) => grant.release()));
    });
  }
}
