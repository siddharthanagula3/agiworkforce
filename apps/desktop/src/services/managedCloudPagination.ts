export type ManagedCloudPaginationResource = 'conversations' | 'messages';

export type ManagedCloudPaginationErrorCode =
  | 'managed_cloud_pagination_non_advancing'
  | 'managed_cloud_pagination_page_limit'
  | 'managed_cloud_pagination_item_limit'
  | 'managed_cloud_pagination_byte_limit';

export interface ManagedCloudPaginationLimits {
  maxPages: number;
  maxItems: number;
  maxBytes: number;
}

export const MANAGED_CLOUD_PAGE_SIZE = 100;
export const MANAGED_CLOUD_CONVERSATION_LIMITS: ManagedCloudPaginationLimits = {
  maxPages: 25,
  maxItems: 2_000,
  maxBytes: 8 * 1024 * 1024,
};
export const MANAGED_CLOUD_MESSAGE_LIMITS: ManagedCloudPaginationLimits = {
  maxPages: 12,
  maxItems: 1_000,
  maxBytes: 32 * 1024 * 1024,
};

function remediation(resource: ManagedCloudPaginationResource): string {
  return resource === 'conversations'
    ? 'Archive older conversations in AGI Web, then retry in Desktop.'
    : 'Start a new chat, or open and export this conversation in AGI Web.';
}

export class ManagedCloudPaginationError extends Error {
  constructor(
    readonly code: ManagedCloudPaginationErrorCode,
    readonly resource: ManagedCloudPaginationResource,
    readonly observed: number,
    readonly limit: number,
    detail: string,
  ) {
    super(`${detail} ${remediation(resource)}`);
    this.name = 'ManagedCloudPaginationError';
  }
}

function serializedByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? Number.POSITIVE_INFINITY
      : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export interface ManagedCloudPageInput {
  items: readonly unknown[];
  hasMore: boolean;
  currentOffset: number;
  nextOffset?: number;
  reportedTotal?: number;
}

export interface ManagedCloudPaginationGuard {
  acceptPage(page: ManagedCloudPageInput): number;
  readonly pages: number;
  readonly items: number;
  readonly bytes: number;
}

export function createManagedCloudPaginationGuard(
  resource: ManagedCloudPaginationResource,
  limits: ManagedCloudPaginationLimits = resource === 'conversations'
    ? MANAGED_CLOUD_CONVERSATION_LIMITS
    : MANAGED_CLOUD_MESSAGE_LIMITS,
): ManagedCloudPaginationGuard {
  let pages = 0;
  let items = 0;
  let bytes = 0;

  const fail = (
    code: ManagedCloudPaginationErrorCode,
    observed: number,
    limit: number,
    detail: string,
  ): never => {
    throw new ManagedCloudPaginationError(code, resource, observed, limit, detail);
  };

  return {
    acceptPage(page) {
      pages += 1;
      if (pages > limits.maxPages) {
        fail(
          'managed_cloud_pagination_page_limit',
          pages,
          limits.maxPages,
          `AGI Cloud history required more than ${limits.maxPages} response pages to load safely.`,
        );
      }

      const nextItemCount = items + page.items.length;
      if (page.reportedTotal !== undefined && page.reportedTotal > limits.maxItems) {
        fail(
          'managed_cloud_pagination_item_limit',
          page.reportedTotal,
          limits.maxItems,
          `This Cloud history contains more than ${limits.maxItems} items and is too large for Desktop to load safely.`,
        );
      }
      if (nextItemCount > limits.maxItems) {
        fail(
          'managed_cloud_pagination_item_limit',
          nextItemCount,
          limits.maxItems,
          `This Cloud history contains more than ${limits.maxItems} items and is too large for Desktop to load safely.`,
        );
      }

      const pageBytes = serializedByteLength(page.items);
      const nextByteCount = bytes + pageBytes;
      if (!Number.isSafeInteger(pageBytes) || nextByteCount > limits.maxBytes) {
        fail(
          'managed_cloud_pagination_byte_limit',
          nextByteCount,
          limits.maxBytes,
          `This Cloud history exceeds Desktop's ${limits.maxBytes}-byte safe loading limit.`,
        );
      }

      const nextOffset = page.nextOffset ?? page.currentOffset + page.items.length;
      if (page.hasMore && (page.items.length === 0 || nextOffset <= page.currentOffset)) {
        fail(
          'managed_cloud_pagination_non_advancing',
          nextOffset,
          page.currentOffset + 1,
          'AGI Cloud returned a history page that did not advance.',
        );
      }

      items = nextItemCount;
      bytes = nextByteCount;

      if (page.hasMore && pages >= limits.maxPages) {
        fail(
          'managed_cloud_pagination_page_limit',
          pages + 1,
          limits.maxPages,
          `AGI Cloud history requires more than ${limits.maxPages} response pages to load safely.`,
        );
      }
      if (page.hasMore && items >= limits.maxItems) {
        fail(
          'managed_cloud_pagination_item_limit',
          items + 1,
          limits.maxItems,
          `This Cloud history contains more than ${limits.maxItems} items and is too large for Desktop to load safely.`,
        );
      }
      if (page.hasMore && bytes >= limits.maxBytes) {
        fail(
          'managed_cloud_pagination_byte_limit',
          bytes + 1,
          limits.maxBytes,
          `This Cloud history exceeds Desktop's ${limits.maxBytes}-byte safe loading limit.`,
        );
      }

      return nextOffset;
    },
    get pages() {
      return pages;
    },
    get items() {
      return items;
    },
    get bytes() {
      return bytes;
    },
  };
}
