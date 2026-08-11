/**
 * Shared "is the Run-code toggle actually honest right now" formula.
 *
 * Mirrors `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`'s
 * `modelSupportsCodeExecution` exactly. Two honest paths:
 *
 * 1. NATIVE tier (anthropic/google/openai): the model runs code on its own
 *    provider-hosted interpreter, so the model-catalog `codeExecution`
 *    capability alone is enough.
 * 2. PLATFORM E2B tier (everyone else): code runs in the platform-executed E2B
 *    sandbox, which is model-agnostic — it only needs the model to emit tool
 *    calls. So gate it on the `tools` capability (NOT the per-model
 *    `codeExecution` cap, which stays truthful as "has a native interpreter")
 *    plus the deployment cut-over flag (`AGI_E2B_EXECUTION=1`, surfaced via
 *    `/api/me` `feature_flags.code_execution`). This lets tools-capable
 *    tools-capable models without a native provider interpreter get an honest
 *    Run-code toggle when E2B is live, without ever rendering a cosmetic dead
 *    control.
 *
 * One shared function so the composer's disabled state (`ChatInput`) and the
 * send-time gate (`useChat`) can never disagree about what "available" means.
 */
export const CODE_EXECUTION_NATIVE_PROVIDERS: readonly string[] = ['anthropic', 'google', 'openai'];

export function isCodeExecutionAvailable(
  modelCapabilityCodeExecution: boolean | undefined,
  modelCapabilityTools: boolean | undefined,
  provider: string | undefined,
  deploymentCodeExecutionEnabled: boolean,
): boolean {
  const providerHasNativeCodeExecution = CODE_EXECUTION_NATIVE_PROVIDERS.includes(
    (provider ?? '').toLowerCase(),
  );
  // Native tier: provider-hosted interpreter, catalog cap is necessary + sufficient.
  if (modelCapabilityCodeExecution && providerHasNativeCodeExecution) return true;
  // Platform E2B tier: model-agnostic, keyed on tool-calling + the deployment flag.
  if (modelCapabilityTools && deploymentCodeExecutionEnabled) return true;
  return false;
}
