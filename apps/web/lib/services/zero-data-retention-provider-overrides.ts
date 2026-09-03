import 'server-only';

const ZDR_AGREEMENT_PROVIDER_ENV: Readonly<Record<string, string>> = Object.freeze({
  openai: 'AGI_OPENAI_ZDR_AGREEMENT',
  anthropic: 'AGI_ANTHROPIC_ZDR_AGREEMENT',
});

const ZDR_AGREEMENT_TRUTHY_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'on']);

function isZdrAgreementEnvSet(envName: string): boolean {
  return ZDR_AGREEMENT_TRUTHY_VALUES.has((process.env[envName] ?? '').trim().toLowerCase());
}

export function resolveZeroDataRetentionProviderOverrides(): ReadonlySet<string> {
  return new Set(
    Object.entries(ZDR_AGREEMENT_PROVIDER_ENV)
      .filter(([, envName]) => isZdrAgreementEnvSet(envName))
      .map(([provider]) => provider),
  );
}
