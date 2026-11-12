import {
  MANAGED_CLOUD_PAGE_READ_PATH,
  ManagedCloudPageReadRequestSchema,
  ManagedCloudPageReadResponseSchema,
  type ManagedCloudPageReadResponse,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY, getManagedCloudAuthContext } from './freeTrialClient';
import { sameManagedCloudOwner, type ManagedCloudOwner } from './managedCloudAuthority';
import { platformRequestHeaders } from '../../platformHeaders';
import { describeCloudRefusal, readCloudRefusal } from './cloudRefusal';

const PAGE_READ_REFUSAL_COPY = {
  refused: 'This account cannot read linked pages from the Chrome extension.',
  unavailable: 'The page reader is temporarily unavailable.',
  limitUnit: 'page reads',
};

export async function readChromeLinkedPage(
  url: string,
  options: { owner: ManagedCloudOwner; signal?: AbortSignal },
  dependencies: {
    getAuth?: typeof getManagedCloudAuthContext;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<ManagedCloudPageReadResponse> {
  options.signal?.throwIfAborted();
  const auth = await (dependencies.getAuth ?? getManagedCloudAuthContext)();
  options.signal?.throwIfAborted();
  if (!auth || !sameManagedCloudOwner(auth.owner, options.owner)) {
    throw new Error('The signed-in account changed. Add the link again.');
  }
  const response = await (dependencies.fetchImpl ?? fetch)(
    `${FREE_TRIAL_GATEWAY}${MANAGED_CLOUD_PAGE_READ_PATH}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...platformRequestHeaders(),
      },
      body: JSON.stringify(ManagedCloudPageReadRequestSchema.parse({ url })),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  options.signal?.throwIfAborted();
  if (!response.ok) {
    const refusal = await readCloudRefusal(response);
    if (refusal.kind === 'failed') {
      throw new Error(`The page could not be read (${response.status}). Try again.`);
    }
    throw new Error(describeCloudRefusal(refusal, PAGE_READ_REFUSAL_COPY));
  }
  const body: unknown = await response.json();
  const parsed = ManagedCloudPageReadResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error('The page reader returned an invalid response. Try again.');
  return parsed.data;
}
