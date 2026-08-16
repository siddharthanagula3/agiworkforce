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
  if (modelCapabilityCodeExecution && providerHasNativeCodeExecution) return true;
  if (modelCapabilityTools && deploymentCodeExecutionEnabled) return true;
  return false;
}
