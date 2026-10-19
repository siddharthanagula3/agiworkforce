import {
  BILLING_PLAN_PRICING,
  creditsFromCents,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import {
  DEV_ACCOUNTS,
  devAccountEmail,
  inSeedOrder,
  resolveDevAccountNames,
  type DevAccountSpec,
} from './catalog';
import { ensureDevAccountUser, findDevAccountUserId } from './clerk';
import type { Print } from './cli';
import type { LocalTestEnvironment } from './environment';
import {
  assertLocalDatabaseServer,
  closeDatabase,
  isDevAccountProvisioned,
  provisionDevAccount,
  readDevAccountState,
} from './provision';

const CLERK_TEST_CODE = '424242';

function ownerResolver(userIds: Map<string, string>): (name: string) => string {
  return (name) => {
    const id = userIds.get(name);
    if (!id) throw new Error(`${name} has no account yet; run seed first.`);
    return id;
  };
}

async function knownUserIds(environment: LocalTestEnvironment): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const account of DEV_ACCOUNTS) {
    const id = await findDevAccountUserId(environment.clerkSecretKey, account.name);
    if (id) ids.set(account.name, id);
  }
  return ids;
}

async function withDatabase<T>(work: () => Promise<T>): Promise<T> {
  try {
    await assertLocalDatabaseServer();
    return await work();
  } finally {
    await closeDatabase();
  }
}

export async function seed(
  environment: LocalTestEnvironment,
  selector: string,
  print: Print,
): Promise<void> {
  const accounts = resolveDevAccountNames(selector);
  await withDatabase(async () => {
    const userIds = await knownUserIds(environment);
    for (const account of inSeedOrder(accounts)) {
      const { userId, created } = await ensureDevAccountUser(environment.clerkSecretKey, account);
      userIds.set(account.name, userId);
      if (!created && (await isDevAccountProvisioned(userId))) {
        print(`${account.name}: already seeded (${userId}); reset it to start over`);
        continue;
      }
      await provisionDevAccount(account, userId, ownerResolver(userIds));
      print(`${account.name}: seeded (${userId})`);
    }
  });
}

export async function reset(
  environment: LocalTestEnvironment,
  selector: string,
  print: Print,
): Promise<void> {
  const accounts = resolveDevAccountNames(selector);
  await withDatabase(async () => {
    const userIds = await knownUserIds(environment);
    for (const account of inSeedOrder(accounts)) {
      const userId = userIds.get(account.name);
      if (!userId) {
        print(`${account.name}: not seeded yet; run seed first`);
        continue;
      }
      await provisionDevAccount(account, userId, ownerResolver(userIds));
      print(`${account.name}: reset to its seed (${userId})`);
    }
  });
}

function describeSeed(account: DevAccountSpec): string {
  return `${BILLING_PLAN_PRICING[account.plan].label}, ${account.billing === 'none' ? 'no own subscription' : `${account.billing} billing`}`;
}

export async function list(environment: LocalTestEnvironment, print: Print): Promise<void> {
  await withDatabase(async () => {
    const userIds = await knownUserIds(environment);
    for (const account of DEV_ACCOUNTS) {
      const userId = userIds.get(account.name);
      print(`${account.name}`);
      print(`  seed:    ${describeSeed(account)}. ${account.purpose}`);
      if (!userId || !(await isDevAccountProvisioned(userId))) {
        print('  state:   not seeded');
        continue;
      }
      const state = await readDevAccountState(userId);
      const credits =
        state.usageCreditsCents === null
          ? 'unknown'
          : `${creditsFromCents(state.usageCreditsCents)}`;
      const label = BILLING_PLAN_PRICING[normalizeBillingPlanTier(state.effectivePlan)].label;
      print(
        `  state:   ${label} (${state.plan}), ${state.status}, ` +
          `billed by ${state.billingSource}; five-hour ${state.fiveHourPercent}%, ` +
          `month ${state.monthlyPercent}%; extra usage ${state.extraUsage ? 'on' : 'off'}, usage credits ${credits}`,
      );
      print(`  user:    ${userId}`);
      print(`  sign in: await signInAsDevAccount(page, '${account.name}')`);
      print(`  by hand: /login with ${devAccountEmail(account.name)}, code ${CLERK_TEST_CODE}`);
    }
  });
}
