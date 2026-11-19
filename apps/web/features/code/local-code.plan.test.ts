import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  canUseBillingPlanCapability,
  getBillingPlanPricing,
  modelsCatalog,
  planIncludesAgiCode,
  PRODUCT_NAMES,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  SELF_SERVE_PAID_PLAN_TIERS,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { getModelMetadata } from '@shared/config/llm';
import type {
  DeveloperRuntimeModels,
  DeveloperTurnFailure,
} from '@agiworkforce/local-runtime-contract';
import {
  EMPTY_LOCAL_TURN,
  LOCAL_CLI_PROGRAM,
  LOCAL_CODE_COPY,
  LOCAL_MODEL_UPGRADE_HEADING,
  localCliProgram,
  localCloudModelsPlan,
  localCloudModelsPlanLine,
  localDraftNeedsPlan,
  localFailureAction,
  localModelChoices,
  localModelPlanLine,
  localModelSetup,
  localOfferFor,
  localProviderSetups,
  localSessionModels,
  localSessionResumeCommand,
  localTranscriptItems,
  localTurnFailureSentence,
  managedLocalModelsIncluded,
  planStartingModelId,
  startingModelId,
  withPlanModelHistory,
  withPlanModelVerdicts,
  withPlanTurnFailure,
} from './local-code';

const plans = Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[];
const PLAN_WITHOUT = plans.find(
  (plan) =>
    plan !== 'local-only' &&
    plan !== 'byok' &&
    !canUseBillingPlanCapability(plan, 'developer_surfaces'),
) as BillingPlanTier;
const PLAN_WITH = plans.find((plan) =>
  canUseBillingPlanCapability(plan, 'developer_surfaces'),
) as BillingPlanTier;

const MANAGED_MODEL = Object.keys(modelsCatalog.models)[0] as string;
const LOCAL_MODEL = 'qa-runner/qa-local';
const BYOK_MODEL = 'qa-provider/qa-byok';

function runtimeWith(
  hostModels: DeveloperRuntimeModels['hostModels'],
  defaultModelId: string | null = null,
): DeveloperRuntimeModels {
  return {
    models: [],
    hostModels,
    defaultModelId,
    defaultAgentMode: null,
    defaultReasoningEffort: null,
    managedSignedIn: true,
  };
}

const managedReachable = {
  id: MANAGED_MODEL,
  provider: 'managed_cloud',
  reachable: true,
  trustMode: 'managed' as const,
  unreachable: null,
};
const localReachable = {
  id: LOCAL_MODEL,
  provider: 'qa-runner',
  reachable: true,
  trustMode: 'local' as const,
  unreachable: null,
};
const byokReachable = {
  id: BYOK_MODEL,
  provider: 'qa-provider',
  reachable: true,
  trustMode: 'byok' as const,
  unreachable: null,
};

function failure(overrides: Partial<DeveloperTurnFailure>): DeveloperTurnFailure {
  return {
    code: 'invalid_request',
    message: 'Your plan does not include Cloud in the CLI and VS Code.',
    provider: 'managed_cloud',
    action: 'open_settings',
    retryable: false,
    ...overrides,
  } as DeveloperTurnFailure;
}

describe('local code on a plan without developer surfaces', () => {
  it('reads the plan split from the billing catalog', () => {
    expect(PLAN_WITHOUT).toBeDefined();
    expect(PLAN_WITH).toBeDefined();
    expect(managedLocalModelsIncluded(PLAN_WITHOUT)).toBe(false);
    expect(managedLocalModelsIncluded(PLAN_WITH)).toBe(true);
  });

  it('leaves the verdicts alone while the plan is unknown', () => {
    const runtime = runtimeWith([managedReachable]);
    expect(managedLocalModelsIncluded(null)).toBe(true);
    expect(withPlanModelVerdicts(runtime, null)).toBe(runtime);
    expect(withPlanModelVerdicts(runtime, undefined)).toBe(runtime);
  });

  it('keeps the account models on a plan that includes them', () => {
    const runtime = runtimeWith([managedReachable]);
    expect(withPlanModelVerdicts(runtime, PLAN_WITH)).toBe(runtime);
    expect(localModelChoices(runtime, []).map((choice) => choice.id)).toEqual([MANAGED_MODEL]);
  });

  it('offers the account models as an upgrade and keeps local and own-key models', () => {
    const runtime = withPlanModelVerdicts(
      runtimeWith([managedReachable, localReachable, byokReachable]),
      PLAN_WITHOUT,
    );

    expect(
      localModelChoices(runtime, [])
        .map((choice) => choice.id)
        .sort(),
    ).toEqual([BYOK_MODEL, LOCAL_MODEL].sort());
    const setups = localProviderSetups(runtime);
    expect(setups).toEqual([
      {
        provider: 'managed_cloud',
        label: LOCAL_CODE_COPY.cloudModels,
        count: 1,
        offer: { kind: 'upgrade' },
      },
    ]);
    expect(localModelSetup(runtime, MANAGED_MODEL)?.offer).toEqual({ kind: 'upgrade' });
    expect(startingModelId(runtime, [])).not.toBe(MANAGED_MODEL);
  });

  it('never starts a session on an account model the plan refuses', () => {
    const runtime = withPlanModelVerdicts(
      runtimeWith([managedReachable], MANAGED_MODEL),
      PLAN_WITHOUT,
    );

    expect(localModelChoices(runtime, [])).toEqual([]);
    expect(startingModelId(runtime, [])).toBeUndefined();
  });

  it('drops account models from a CLI that reports no host verdicts', () => {
    const runtime = withPlanModelVerdicts(
      {
        ...runtimeWith([]),
        models: [
          { id: MANAGED_MODEL, provider: 'managed_cloud', local: false },
          { id: LOCAL_MODEL, provider: 'qa-runner', local: true },
        ],
      },
      PLAN_WITHOUT,
    );

    expect(runtime?.models.map((model) => model.id)).toEqual([LOCAL_MODEL]);
  });

  it('blocks a draft only when nothing it could start on is included', () => {
    const onlyManaged = withPlanModelVerdicts(runtimeWith([managedReachable]), PLAN_WITHOUT);
    const withLocal = withPlanModelVerdicts(
      runtimeWith([managedReachable, localReachable]),
      PLAN_WITHOUT,
    );

    expect(
      localDraftNeedsPlan(onlyManaged, localModelChoices(onlyManaged, []), '', PLAN_WITHOUT),
    ).toBe(true);
    expect(
      localDraftNeedsPlan(withLocal, localModelChoices(withLocal, []), LOCAL_MODEL, PLAN_WITHOUT),
    ).toBe(false);
    expect(
      localDraftNeedsPlan(withLocal, localModelChoices(withLocal, []), MANAGED_MODEL, PLAN_WITHOUT),
    ).toBe(true);
    expect(localDraftNeedsPlan(onlyManaged, [], '', PLAN_WITH)).toBe(false);
    expect(localDraftNeedsPlan(null, [], '', PLAN_WITHOUT)).toBe(false);
  });

  it('says a refused account turn is a plan matter and offers the upgrade', () => {
    const turn = withPlanTurnFailure({ ...EMPTY_LOCAL_TURN, failure: failure({}) }, PLAN_WITHOUT);

    expect(turn.failure?.code).toBe('plan_excludes_model');
    expect(localTurnFailureSentence(turn.failure as DeveloperTurnFailure)).not.toContain('VS Code');
    expect(localFailureAction(turn.failure as DeveloperTurnFailure)).toEqual({ kind: 'upgrade' });
  });

  it('leaves other failures and plans that include the models as they were', () => {
    const own = { ...EMPTY_LOCAL_TURN, failure: failure({ provider: 'qa-provider' }) };
    const paid = { ...EMPTY_LOCAL_TURN, failure: failure({}) };
    const network = { ...EMPTY_LOCAL_TURN, failure: failure({ code: 'network' }) };

    expect(withPlanTurnFailure(own, PLAN_WITHOUT)).toBe(own);
    expect(withPlanTurnFailure(paid, PLAN_WITH)).toBe(paid);
    expect(withPlanTurnFailure(paid, null)).toBe(paid);
    expect(withPlanTurnFailure(network, PLAN_WITHOUT)).toBe(network);
  });

  it('offers an upgrade for any failure whose remedy is the plan', () => {
    expect(localOfferFor('upgrade_plan', 'managed_cloud', false)).toEqual({ kind: 'upgrade' });
  });
});

const PRICED_MANAGED_MODEL = Object.keys(modelsCatalog.models).find((id) => {
  const metadata = getModelMetadata(id);
  return (
    metadata !== undefined &&
    metadata !== null &&
    metadata.qualityTier !== 'best' &&
    metadata.inputCost + metadata.outputCost > 0
  );
}) as string;

const managedPriced = { ...managedReachable, id: PRICED_MANAGED_MODEL };

function sessionOn(model: string, trustMode: 'local' | 'byok' | 'managed' | 'unknown') {
  return {
    id: `thread-${model}`,
    rootId: 'root-1',
    title: 'Earlier work',
    cwd: '/work/qa-project',
    model,
    provider: null,
    trustMode,
    status: 'idle' as const,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:05:00Z',
    origin: 'desktop' as const,
  };
}

describe('what the plan copy says on every plan', () => {
  const paidWithout = SELF_SERVE_PAID_PLAN_TIERS.filter(
    (plan) => !canUseBillingPlanCapability(plan, 'developer_surfaces'),
  );

  it('names the first plan on sale that has developer surfaces, never "paid plans"', () => {
    const plan = localCloudModelsPlan();

    expect(plan).not.toBeNull();
    expect(canUseBillingPlanCapability(plan, 'developer_surfaces')).toBe(true);
    expect(paidWithout).not.toContain(plan);
    expect(localCloudModelsPlanLine()).toBe(
      LOCAL_CODE_COPY.cloudModelsFromPlan(getBillingPlanPricing(plan).label),
    );
    expect(localCloudModelsPlanLine()).not.toMatch(/paid plans/i);
    expect(LOCAL_MODEL_UPGRADE_HEADING).not.toMatch(/paid plans/i);
  });

  it('tells a paid plan without developer surfaces which plan has them', () => {
    const cloud = localProviderSetups(
      withPlanModelVerdicts(runtimeWith([managedReachable]), PLAN_WITHOUT),
    )[0]!;

    for (const plan of [PLAN_WITHOUT, ...paidWithout]) {
      expect(localModelPlanLine(cloud, 'QA model', plan)).toBe(localCloudModelsPlanLine());
    }
  });

  it('scopes the line to sessions on this computer, which a plan with cloud Code still lacks', () => {
    const cloudCodeOnly = SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.find(
      (plan) =>
        planIncludesAgiCode(plan) && !canUseBillingPlanCapability(plan, 'developer_surfaces'),
    );
    const cloud = localProviderSetups(
      withPlanModelVerdicts(runtimeWith([managedReachable]), cloudCodeOnly),
    )[0]!;
    const denial = new RegExp(`cloud models in ${PRODUCT_NAMES.code}`, 'i');

    expect(cloudCodeOnly).toBeDefined();
    expect(managedLocalModelsIncluded(cloudCodeOnly)).toBe(false);
    expect(localModelPlanLine(cloud, 'QA model', cloudCodeOnly)).toBe(localCloudModelsPlanLine());
    for (const line of [
      localCloudModelsPlanLine(),
      LOCAL_CODE_COPY.cloudModelsFromPlan('QA'),
      LOCAL_CODE_COPY.cloudModelsNotInPlan,
    ]) {
      expect(line).not.toMatch(denial);
      expect(line).toMatch(/sessions on this computer/);
    }
  });

  it('says a model the CLI leaves out of a plan with developer surfaces is not in that plan', () => {
    const flagship = localProviderSetups(
      runtimeWith([
        {
          id: MANAGED_MODEL,
          provider: 'qa-vendor',
          reachable: false,
          trustMode: 'managed',
          unreachable: { code: 'plan_excludes_model', action: 'upgrade_plan', provider: null },
        },
      ]),
    )[0]!;

    expect(flagship.offer).toEqual({ kind: 'upgrade' });
    expect(localModelPlanLine(flagship, 'QA model', PLAN_WITH)).toBe(
      LOCAL_CODE_COPY.modelNotInPlan('QA model'),
    );
    expect(
      localModelPlanLine({ ...flagship, provider: 'managed_cloud' }, 'QA model', PLAN_WITH),
    ).toBe(LOCAL_CODE_COPY.modelNotInPlan('QA model'));
  });
});

describe('the model a session started from the rail begins on', () => {
  it('opens the draft instead when the plan leaves nothing ready', () => {
    const runtime = withPlanModelVerdicts(runtimeWith([managedReachable]), PLAN_WITHOUT);

    expect(planStartingModelId(runtime, [], PLAN_WITHOUT)).toBeNull();
    expect(planStartingModelId(null, [], PLAN_WITHOUT)).toBeNull();
  });

  it('starts on a model on this computer over the CLI default the plan refuses', () => {
    const raw = runtimeWith([managedPriced, localReachable], PRICED_MANAGED_MODEL);

    expect(startingModelId(raw, [])).toBe(PRICED_MANAGED_MODEL);
    expect(planStartingModelId(withPlanModelVerdicts(raw, PLAN_WITHOUT), [], PLAN_WITHOUT)).toBe(
      LOCAL_MODEL,
    );
  });

  it('skips a model from the folder history that the plan refuses', () => {
    const raw = runtimeWith([managedPriced, localReachable]);
    const history = [sessionOn(PRICED_MANAGED_MODEL, 'managed')];

    expect(startingModelId(raw, history)).toBe(PRICED_MANAGED_MODEL);
    expect(
      planStartingModelId(withPlanModelVerdicts(raw, PLAN_WITHOUT), history, PLAN_WITHOUT),
    ).toBe(LOCAL_MODEL);
  });

  it('leaves the choice as it was on a plan that includes the models, or an unknown one', () => {
    const raw = runtimeWith([managedPriced], PRICED_MANAGED_MODEL);

    expect(planStartingModelId(raw, [], PLAN_WITH)).toBe(PRICED_MANAGED_MODEL);
    expect(planStartingModelId(null, [], null)).toBeUndefined();
  });
});

describe('a CLI that gives no host verdicts, on a plan without developer surfaces', () => {
  const olderCli = (models: DeveloperRuntimeModels['models'], defaultModelId: string | null) => ({
    ...runtimeWith([], defaultModelId),
    models,
  });
  const managedOption = { id: PRICED_MANAGED_MODEL, provider: 'managed_cloud', local: false };
  const localOption = { id: LOCAL_MODEL, provider: 'qa-runner', local: true };
  const accountHistory = [
    sessionOn(PRICED_MANAGED_MODEL, 'managed'),
    { ...sessionOn(MANAGED_MODEL, 'unknown'), id: 'thread-routed', provider: 'managed_cloud' },
  ];

  it('drops the sessions that ran on the account from the history it offers', () => {
    const local = sessionOn(LOCAL_MODEL, 'local');
    const history = [...accountHistory, local];

    expect(withPlanModelHistory(history, PLAN_WITHOUT)).toEqual([local]);
    expect(withPlanModelHistory(history, PLAN_WITH)).toBe(history);
    expect(withPlanModelHistory(history, null)).toBe(history);
  });

  it('starts on a model on this computer, never on one the account ran here before', () => {
    const raw = olderCli([managedOption, localOption], null);

    expect(startingModelId(raw, accountHistory)).toBe(PRICED_MANAGED_MODEL);
    const runtime = withPlanModelVerdicts(raw, PLAN_WITHOUT);
    expect(
      localModelChoices(runtime, accountHistory, PLAN_WITHOUT).map((choice) => choice.id),
    ).toEqual([LOCAL_MODEL]);
    expect(planStartingModelId(runtime, accountHistory, PLAN_WITHOUT)).toBe(LOCAL_MODEL);
  });

  it('opens the draft, and blocks it, when the account history is all the folder has', () => {
    const runtime = withPlanModelVerdicts(olderCli([managedOption], null), PLAN_WITHOUT);
    const choices = localModelChoices(runtime, accountHistory, PLAN_WITHOUT);

    expect(choices).toEqual([]);
    expect(planStartingModelId(runtime, accountHistory, PLAN_WITHOUT)).toBeNull();
    expect(localDraftNeedsPlan(runtime, choices, '', PLAN_WITHOUT)).toBe(true);
  });

  it('drops a CLI default that runs on the account', () => {
    const runtime = withPlanModelVerdicts(
      olderCli([managedOption, localOption], PRICED_MANAGED_MODEL),
      PLAN_WITHOUT,
    );

    expect(runtime?.defaultModelId).toBeNull();
    expect(localModelChoices(runtime, [], PLAN_WITHOUT).map((choice) => choice.id)).toEqual([
      LOCAL_MODEL,
    ]);
    expect(
      withPlanModelVerdicts(olderCli([localOption], LOCAL_MODEL), PLAN_WITHOUT)?.defaultModelId,
    ).toBe(LOCAL_MODEL);
  });

  it('keeps the history for an open session only where the plan includes it', () => {
    const runtime = olderCli([localOption], null);

    expect(
      localSessionModels(runtime, accountHistory, 'managed', PLAN_WITHOUT).here.map(
        (choice) => choice.id,
      ),
    ).toEqual([LOCAL_MODEL]);
    expect(
      localSessionModels(runtime, accountHistory, 'managed', PLAN_WITH)
        .here.map((choice) => choice.id)
        .sort(),
    ).toEqual([...new Set([LOCAL_MODEL, MANAGED_MODEL, PRICED_MANAGED_MODEL])].sort());
  });
});

describe('the models an open session is offered', () => {
  it('keeps a Local session to models on this computer and offers a key as a new session', () => {
    const offered = localSessionModels(runtimeWith([localReachable, byokReachable]), [], 'local');

    expect(offered.here.map((choice) => choice.id)).toEqual([LOCAL_MODEL]);
    expect(offered.elsewhere.map((choice) => choice.id)).toEqual([BYOK_MODEL]);
    expect(offered.ready).toBe(LOCAL_MODEL);
    expect(offered.readyElsewhere).toBe(BYOK_MODEL);
  });

  it('gives a Managed session the plan refuses no switch, only a new session', () => {
    const runtime = withPlanModelVerdicts(
      runtimeWith([managedReachable, localReachable]),
      PLAN_WITHOUT,
    );
    const offered = localSessionModels(runtime, [sessionOn(MANAGED_MODEL, 'managed')], 'managed');

    expect(offered.here).toEqual([]);
    expect(offered.ready).toBeUndefined();
    expect(offered.readyElsewhere).toBe(LOCAL_MODEL);
  });

  it('offers everything as before to a session whose boundary is unverified', () => {
    const offered = localSessionModels(runtimeWith([localReachable, byokReachable]), [], 'unknown');

    expect(offered.here.map((choice) => choice.id).sort()).toEqual(
      [BYOK_MODEL, LOCAL_MODEL].sort(),
    );
    expect(offered.elsewhere).toEqual([]);
  });
});

describe('the sign-in command a Desktop install can run', () => {
  const bundled = '/Applications/QA App.app/Contents/Resources/agi-cli/agi';

  it('names the bundled or chosen CLI by its path, quoted for the shell', () => {
    expect(localCliProgram({ source: 'bundled', path: bundled })).toBe(`'${bundled}'`);
    expect(localCliProgram({ source: 'custom', path: '~/tools/qa agi' })).toBe("~/'tools/qa agi'");
    expect(localCliProgram({ source: 'custom', path: "/opt/it's/agi" })).toBe(
      `'/opt/it'\\''s/agi'`,
    );
  });

  it('keeps the bare name only for a CLI found on the PATH', () => {
    expect(localCliProgram({ source: 'path', path: '/usr/local/bin/agi' })).toBe(LOCAL_CLI_PROGRAM);
    expect(localCliProgram({ source: 'bundled', path: null })).toBe(LOCAL_CLI_PROGRAM);
    expect(localCliProgram(null)).toBe(LOCAL_CLI_PROGRAM);
  });

  it('puts that program in the resume command, quoting a session id only when it must', () => {
    const program = localCliProgram({ source: 'bundled', path: bundled });

    expect(localSessionResumeCommand('thread-1')).toBe(`${LOCAL_CLI_PROGRAM} --resume thread-1`);
    expect(localSessionResumeCommand('thread-1', program)).toBe(`'${bundled}' --resume thread-1`);
    expect(localSessionResumeCommand("it's mine", program)).toBe(
      `'${bundled}' --resume 'it'\\''s mine'`,
    );
  });

  it('puts that program in the copied command, the sentence and the setup row', () => {
    const program = localCliProgram({ source: 'bundled', path: bundled });
    const missing = failure({
      code: 'provider_auth_missing',
      provider: 'qa-provider',
      action: 'sign_in_provider',
    });

    expect(localFailureAction(missing, program)).toEqual({
      kind: 'copy',
      text: `'${bundled}' login qa-provider`,
    });
    expect(localTurnFailureSentence(missing, program)).toContain(
      `\`'${bundled}' login qa-provider\``,
    );
    expect(
      localTranscriptItems([], { ...EMPTY_LOCAL_TURN, failure: missing }, program).at(-1),
    ).toMatchObject({ text: expect.stringContaining(`'${bundled}' login qa-provider`) });
    expect(
      localProviderSetups(
        runtimeWith([
          {
            id: BYOK_MODEL,
            provider: 'qa-provider',
            reachable: false,
            trustMode: 'byok',
            unreachable: {
              code: 'provider_auth_missing',
              action: 'sign_in_provider',
              provider: 'qa-provider',
            },
          },
        ]),
        program,
      )[0]?.offer,
    ).toEqual({ kind: 'copy', text: `'${bundled}' login qa-provider` });
    expect(localOfferFor('sign_in_provider', 'qa-provider', false)).toEqual({
      kind: 'copy',
      text: `${LOCAL_CLI_PROGRAM} login qa-provider`,
    });
  });
});
