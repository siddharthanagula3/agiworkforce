/**
 * Shared "is the Run-code toggle actually honest right now" formula.
 *
 * Mirrors `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`'s
 * `modelSupportsCodeExecution` exactly: the model-catalog `codeExecution`
 * capability is necessary but not sufficient. Native-tier providers
 * (anthropic/google/openai) run code on their own provider-hosted
 * interpreter, so the catalog flag alone is enough for them. Everyone else
 * executes via E2B, which the server only offers when the deployment's
 * cut-over flag is on (`AGI_E2B_EXECUTION=1`, surfaced via `/api/me`
 * `feature_flags.code_execution`) — gate those on BOTH signals so the toggle
 * is never a cosmetic dead control.
 *
 * One shared function so the composer's disabled state (`ChatInput`) and the
 * send-time gate (`useChat`) can never disagree about what "available" means.
 */
export const CODE_EXECUTION_NATIVE_PROVIDERS: readonly string[] = ['anthropic', 'google', 'openai'];

export function isCodeExecutionAvailable(
  modelCapabilityCodeExecution: boolean | undefined,
  provider: string | undefined,
  deploymentCodeExecutionEnabled: boolean,
): boolean {
  if (!modelCapabilityCodeExecution) return false;
  const providerHasNativeCodeExecution = CODE_EXECUTION_NATIVE_PROVIDERS.includes(
    (provider ?? '').toLowerCase(),
  );
  return providerHasNativeCodeExecution || deploymentCodeExecutionEnabled;
}
