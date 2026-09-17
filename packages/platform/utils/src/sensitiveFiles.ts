export const SENSITIVE_FILE_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)\.envrc$/i,

  /(^|\/)secrets?\.(json|ya?ml|toml|env|txt|js|ts)$/i,
  /(^|\/).*credentials?(\.[A-Za-z0-9]+)?$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.dockercfg$/i,
  /(^|\/)\.docker\/config\.json$/i,

  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|p12|pfx|key|crt|cer|gpg|asc)$/i,
  /(^|\/)authorized_keys$/i,
  /(^|\/)known_hosts$/i,

  /(^|\/)\.ssh\//i,
  /(^|\/)\.gnupg\//i,
  /(^|\/)\.aws\//i,
  /(^|\/)\.gcloud\//i,
  /(^|\/)\.config\/gcloud\//i,
  /(^|\/)\.azure\//i,
  /(^|\/)\.kube\/config$/i,

  /(^|\/)\.git\/(config|credentials)$/i,
  /(^|\/)\.git-credentials$/i,

  /(^|\/)\.(github|gitlab)_token$/i,

  // Terraform state holds every resource attribute in plain text, including the
  // secrets a provider generated, and a .tfvars file is where the inputs to it
  // are kept. Both are ordinary-looking project files.
  /(^|\/).*\.tfstate(\.backup)?$/i,
  /(^|\/)terraform\.tfstate\.d\//i,
  /(^|\/).*\.auto\.tfvars(\.json)?$/i,
  /(^|\/)terraform\.tfvars(\.json)?$/i,
  /(^|\/)\.terraform\/terraform\.tfstate$/i,
  /(^|\/)\.terraformrc$/i,
  /(^|\/)terraform\.rc$/i,
];

export function isSensitiveFile(pathLike: string): boolean {
  if (typeof pathLike !== 'string' || pathLike.length === 0) return false;
  const normalized = pathLike.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(normalized));
}

export function matchSensitivePattern(pathLike: string): RegExp | undefined {
  if (typeof pathLike !== 'string' || pathLike.length === 0) return undefined;
  const normalized = pathLike.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.find((re) => re.test(normalized));
}
