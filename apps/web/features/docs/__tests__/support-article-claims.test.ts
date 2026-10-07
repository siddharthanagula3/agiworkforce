import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

function rendered(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '');
}

function collapsed(relativePath: string): string {
  return rendered(relativePath).replace(/\s+/gu, ' ');
}

function fileText(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

function repoText(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), 'utf8');
}

function canonicalSupportUrl(path: string): string {
  const site = fileText('lib/seo/site.ts');
  const origin = /NEXT_PUBLIC_APP_URL'\]\s*\?\?\s*'([^']+)'/u.exec(site)?.[1];
  if (!origin) throw new Error('Missing canonical public origin');
  return new URL(path, origin).href;
}

describe('BYOK help article follows the implemented credential paths', () => {
  const article = collapsed('content/support/byok-provider-keys.md');
  const auth = repoText('apps', 'cli', 'src', 'auth.rs');
  const secureStore = repoText('apps', 'cli', 'src', 'secure_store.rs');
  const providerDispatch = repoText('apps', 'cli', 'src', 'models', 'provider_dispatch.rs');

  it('links the canonical availability page instead of declaring a release', () => {
    const availability = fileText('app/get-started/page.tsx');
    expect(availability).toMatch(
      /import \{[^}]*\bSURFACE_STATUS\b[^}]*\} from ['"]@\/lib\/marketing-constants['"]/u,
    );
    expect(fileText('lib/marketing-constants.ts')).toMatch(
      /export \{[^}]*\bSURFACE_STATUS\b[^}]*\} from ['"]\.\/surface-status['"]/u,
    );
    expect(article).toContain(`[surface availability](${canonicalSupportUrl('/get-started')})`);
    expect(article).not.toMatch(
      /released CLI|published release|coming soon|no VSIX has been published/iu,
    );
  });

  it('names the implemented provider login and credential inspection commands', () => {
    const commands = repoText('apps', 'cli', 'src', 'lib.rs');
    expect(commands).toMatch(/Login \{[\s\S]{0,350}provider: Option<String>/u);
    expect(commands).toMatch(/Command::AuthStatus => \{[\s\S]{0,150}auth::auth_status\(\)/u);
    expect(auth).toMatch(
      /is_api_key_provider\(pid\) \{\s*interactive_api_key_login_for_provider\(pid\)/u,
    );
    expect(auth).toMatch(
      /dialoguer::Password::new\(\)[\s\S]{0,500}save_auth_entry\(provider.id, AuthEntry::ApiKey \{ key \}\)/u,
    );
    expect(article).toContain('`agi login <provider>`');
    expect(article).toContain('`agi auth-status`');
  });

  it('keeps a bare login on AGI account authentication', () => {
    expect(auth).toMatch(/matches!\(provider, None \| Some\("agi"\) \| Some\("agiworkforce"\)\)/u);
    expect(auth).toMatch(
      /is_agiworkforce_login_provider\(provider\) \{\s*return login_agiworkforce\(\)/u,
    );
    expect(auth).toMatch(
      /pub async fn login_agiworkforce\(\)[\s\S]{0,800}device_code_login\(&base\)/u,
    );
    expect(article).toContain(
      'A bare `agi login` starts AGI managed-cloud sign-in and does not prompt for a provider API key.',
    );
  });

  it('describes auth-status as local credential reporting rather than provider validation', () => {
    const start = auth.indexOf('pub fn auth_status()');
    const end = auth.indexOf('/// Core status logic', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const reporting = auth.slice(start, end);
    expect(reporting).toContain('let store = AuthStore::load()?;');
    expect(reporting).toContain('let results = auth_status_from_store(');
    expect(auth).toMatch(
      /AuthEntry::ApiKey \{ \.\. \} => AuthStatusEntry \{[\s\S]{0,180}status: "active"\.to_string\(\)/u,
    );
    expect(article).toContain(
      '`agi auth-status` reports stored credentials and does not validate the key with the provider.',
    );
  });

  it('retains both the keyring path and the implemented file-storage exceptions', () => {
    expect(secureStore).toMatch(/std::env::var\("AGIWORKFORCE_NO_KEYRING"\)/u);
    expect(secureStore).toMatch(/!cfg!\(target_os = "linux"\) && !keyring_disabled\(\)/u);
    expect(auth).toMatch(
      /if !crate::secure_store::uses_keychain\(\) \{[\s\S]{0,350}write_owner_only_file\(&path, &data\)/u,
    );
    expect(auth).toContain('save_keyring_auth(&OsKeyring::for_config_root()?, &path, self)');
    expect(article).toContain(
      'Keys saved with `agi login <provider>` are stored in the OS credential store except on Linux or when `AGIWORKFORCE_NO_KEYRING` disables the keyring.',
    );
    expect(article).toContain(
      'In those cases, these saved keys are stored in files in the CLI configuration directory.',
    );
  });

  it('keeps VS Code provider keys on the CLI path rather than the AGI-account SecretStorage entry', () => {
    const runtime = repoText(
      'apps',
      'extension-vscode',
      'src',
      'integrations',
      'localRuntimeClient.ts',
    );
    const host = repoText('apps', 'cli', 'src', 'app_server', 'developer_host.rs');
    const setup = repoText('apps', 'extension-vscode', 'src', 'core', 'commandSetup.ts');
    expect(runtime).toMatch(
      /async setProviderKey\([\s\S]{0,350}connection.request\('providers\/setKey', \{ provider, apiKey \}\)/u,
    );
    expect(host).toMatch(
      /async fn set_provider_key\([\s\S]{0,450}crate::auth::save_api_key\(&params.provider, &params.api_key\)/u,
    );
    expect(setup).toContain(
      'Enter your AGI Workforce API key. It will be stored in VS Code SecretStorage',
    );
    expect(article).toContain(
      'VS Code provider-key management requires a connected local CLI runtime and delegates key storage to that runtime.',
    );
    expect(article).not.toMatch(
      /SecretStorage-backed key flow|provider[^.]*SecretStorage|SecretStorage[^.]*provider/iu,
    );
  });

  it('distinguishes configured custom providers from the built-in login list', () => {
    expect(auth).toMatch(
      /fn api_key_provider\([\s\S]{0,250}API_KEY_PROVIDERS[\s\S]{0,180}candidate.id == normalized/u,
    );
    expect(providerDispatch).toMatch(
      /let Some\(base\) = pc.base_url.as_ref\(\) else \{\s*continue;/u,
    );
    expect(providerDispatch).toMatch(
      /if !is_safe_provider_base_url\(trimmed\) \{[\s\S]{0,350}continue;/u,
    );
    expect(providerDispatch).toContain('api_key_env: pc.api_key_env.clone()');
    expect(article).toContain('Provider API-key login accepts only the built-in provider list.');
    expect(article).toContain(
      'Custom OpenAI-compatible providers require a CLI configuration entry with `base_url`; `api_key_env` is optional.',
    );
    expect(article).toContain('Custom-provider URLs must pass the CLI endpoint validation.');
  });

  it('pins Managed Cloud credential selection without a universal transport or markup promise', () => {
    const resolver = providerDispatch.indexOf('fn resolve_key');
    expect(resolver).toBeGreaterThan(-1);
    const start = providerDispatch.indexOf('Provider::ManagedCloud => {', resolver);
    const end = providerDispatch.indexOf('Provider::Ollama(OllamaMode::Local) =>', resolver);
    expect(start).toBeGreaterThan(resolver);
    expect(end).toBeGreaterThan(start);
    const managed = providerDispatch.slice(start, end);
    expect(managed).toContain('let token = crate::tier_cache::load_jwt();');
    expect(managed).toContain('Ok(token)');
    expect(managed).not.toMatch(/resolve_config_env_auth_key|auth_store_api_key/u);
    expect(article).toContain(
      'CLI Managed Cloud requests require an AGI account token rather than a saved provider API key.',
    );
    expect(article).not.toMatch(
      /AGI sends requests directly|AGI adds no markup|billed by that provider|BYOK credentials are explicitly refused/iu,
    );
  });
});

describe('current CLI help articles distinguish implementation from release availability', () => {
  const articles = [
    'accounts-and-sign-in',
    'byok-provider-keys',
    'desktop-and-cli',
    'getting-started',
    'install-desktop-and-mobile',
    'local-mode',
    'providers-and-models',
    'vscode-extension',
  ] as const;
  const availabilityUrl = canonicalSupportUrl('/get-started');

  it.each(articles)('%s links availability before its CLI commands', (id) => {
    const article = fileText(`content/support/${id}.md`);
    const link = article.indexOf(`[surface availability](${availabilityUrl})`);
    expect(link).toBeGreaterThan(-1);
    const command = article.indexOf('`agi ');
    if (command >= 0) expect(link).toBeLessThan(command);
  });

  it.each(articles)('%s makes no private current CLI publication promise', (id) => {
    const article = collapsed(`content/support/${id}.md`);
    expect(article).not.toMatch(
      /released CLI|CLI (?:is|are) available now|web app and the CLI are available now|It is published, it accepts provider keys/iu,
    );
    expect(article).not.toMatch(/VS Code BYOK is coming soon|no published mobile release/iu);
  });

  it('keeps local-runtime instructions attached to actual probe and streaming paths', () => {
    const local = repoText('apps', 'cli', 'src', 'local_models.rs');
    const streaming = repoText('apps', 'cli', 'src', 'models', 'streaming.rs');
    expect(local).toMatch(
      /pub fn configured_local_base_url[\s\S]{0,450}"ollama"[\s\S]{0,250}"lmstudio"/u,
    );
    expect(local).toMatch(/pub async fn ensure_local_model_available[\s\S]{0,450}probe_ollama/u);
    expect(local).toContain('probe_openai_compatible_local(client, provider, base_url).await');
    expect(local).toContain('if !probe.running {');
    expect(local).toContain('if probe.models.iter().any(|candidate| candidate.id == model)');
    expect(local).toContain('return Ok(probe.base_url);');
    const commands = repoText('apps', 'cli', 'src', 'lib.rs');
    expect(commands).toContain(
      'ModelsSubcommand::Status { json } | ModelsSubcommand::Scan { json } =>',
    );
    expect(commands).toContain('let probes = local_models::discover_all(config).await;');
    expect(streaming).toContain('Provider::Ollama(OllamaMode::Local) => {');
    expect(streaming).toContain(
      'crate::local_models::configured_local_base_url(config, "lmstudio")',
    );
    expect(streaming).toContain(
      'crate::local_models::openai_chat_completions_url(&verified_base_url)?',
    );
    expect(collapsed('content/support/local-mode.md')).toContain('`agi models scan`');
    expect(collapsed('content/support/local-mode.md')).toContain(
      '`agi --provider <runtime> --model <model>`',
    );
  });

  it('titles the local guide for inference without a whole-process offline promise', () => {
    const article = fileText('content/support/local-mode.md');
    expect(article).toMatch(/^title: Run a local model$/mu);
    expect(article).not.toMatch(/^title:.*offline/imu);
    const tags = /^tags: (.+)$/mu.exec(article)?.[1];
    expect(tags).toBeDefined();
    expect(tags?.split(',').map((tag) => tag.trim().toLowerCase())).not.toContain('no internet');
  });

  it('scopes local inference separately from conditional catalog refresh and tool network use', () => {
    const cache = repoText('apps', 'cli', 'src', 'tier_cache.rs');
    const ensureStart = cache.indexOf('pub async fn ensure_plan_models_cached()');
    const refreshStart = cache.indexOf('async fn refresh_plan_models_cache()', ensureStart);
    const refreshEnd = cache.indexOf('pub fn adopt_server_plan(', refreshStart);
    expect(ensureStart).toBeGreaterThan(-1);
    expect(refreshStart).toBeGreaterThan(ensureStart);
    expect(refreshEnd).toBeGreaterThan(refreshStart);
    const ensure = cache.slice(ensureStart, refreshStart);
    expect(ensure).toMatch(
      /if read_plan_models_cache\(\)\.is_some\(\) \|\| load_jwt\(\)\.is_none\(\) \{\s*return;\s*\}\s*refresh_plan_models_cache\(\)\.await;/u,
    );
    const refresh = cache.slice(refreshStart, refreshEnd);
    expect(refresh).toContain('crate::models::gateway_models::discover_gateway_models().await');
    expect(refresh).toContain('write_plan_models_cache(&ids);');
    expect(refresh).toMatch(/Err\(error\) => tracing::debug!/u);
    const commands = repoText('apps', 'cli', 'src', 'lib.rs');
    expect(commands).toMatch(
      /\) -> Result<\(\)> \{\s*crate::tier_cache::ensure_plan_models_cached\(\)\.await;\s*let resolved_provider_override = models::plan_first_provider_override\(/u,
    );
    const gateway = repoText('apps', 'cli', 'src', 'models', 'gateway_models.rs');
    const fetchStart = gateway.indexOf('async fn fetch_from_endpoint(');
    const discoverStart = gateway.indexOf('pub async fn discover_gateway_models()', fetchStart);
    const discoverEnd = gateway.indexOf('fn user_tier(', discoverStart);
    expect(fetchStart).toBeGreaterThan(-1);
    expect(discoverStart).toBeGreaterThan(fetchStart);
    expect(discoverEnd).toBeGreaterThan(discoverStart);
    const fetch = gateway.slice(fetchStart, discoverStart);
    expect(fetch).toContain('.get(endpoint)');
    expect(fetch).toMatch(/let response = request\s*\.send\(\)\s*\.await/u);
    const discovery = gateway.slice(discoverStart, discoverEnd);
    expect(discovery).toContain('let endpoint = models_endpoint(&raw_base)?;');
    expect(discovery).toContain('let jwt = crate::tier_cache::load_jwt();');
    expect(discovery).toContain('fetch_from_endpoint(&client, &endpoint, jwt.as_deref()).await');
    const mcp = repoText('apps', 'cli', 'src', 'mcp', 'mod.rs');
    expect(mcp).toMatch(
      /fn mcp_transport_allowed\([\s\S]{0,250}privacy_mode != crate::agent::PrivacyMode::Local\s*\|\| matches!\(config\.as_transport\(\), McpTransport::Stdio \{ \.\. \}\)/u,
    );
    const tools = repoText('apps', 'cli', 'src', 'agent', 'tools.rs');
    expect(tools).toContain('mgr.tool_identity(name, privacy_mode)');
    expect(tools).toContain('policy.resolve_mcp(&server_name, &tool_name)');
    expect(tools).toContain('mgr.execute_tool(name, arguments, privacy_mode).await');
    const article = collapsed('content/support/local-mode.md');
    expect(article).toContain('Local describes the inference route.');
    expect(article).toContain(
      'Signed-in CLI startup may refresh the managed model catalog when it is not cached.',
    );
    expect(article).toContain('Review network use by tools and connectors separately.');
  });

  it('keeps auth-status a saved-credential inspection rather than a provider-key validation', () => {
    const auth = repoText('apps', 'cli', 'src', 'auth.rs');
    const start = auth.indexOf('pub fn auth_status()');
    const end = auth.indexOf('/// Core status logic', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(auth.slice(start, end)).toContain('let store = AuthStore::load()?;');
    expect(auth.slice(start, end)).toContain('auth_status_from_store(');
    const article = collapsed('content/support/getting-started.md');
    expect(article).toContain('inspect saved credentials with `agi auth-status`');
    expect(article).not.toMatch(/verify it with `agi auth-status`/u);
  });

  it('reuses the verified BYOK custody guide instead of a universal OS-store promise', () => {
    const url = canonicalSupportUrl('/help/byok-provider-keys');
    for (const id of ['accounts-and-sign-in', 'desktop-and-cli']) {
      const article = collapsed(`content/support/${id}.md`);
      expect(article).toContain(url);
      expect(article).not.toMatch(
        /stores provider keys in the (?:operating system|OS) credential store/u,
      );
    }
    expect(repoText('apps', 'cli', 'src', 'secure_store.rs')).toContain(
      '!cfg!(target_os = "linux") && !keyring_disabled()',
    );
  });

  it('retains the implemented Desktop cloud boundary in all touched surface explanations', () => {
    const dispatcher = repoText('apps', 'desktop', 'electron', 'runtime', 'dispatcher.ts');
    expect(dispatcher).toContain('localModels: false');
    expect(dispatcher).toMatch(
      /if \(localInferenceCommands\.has\(command\)\) \{\s*return runtimeFailure\('unsupported-platform'/u,
    );
    expect(repoText('apps', 'desktop', 'electron', 'config.ts')).toMatch(
      /AGI_CLOUD_RENDERER'\] === 'bundled' \? 'bundled' : 'remote'/u,
    );
    expect(fileText('app/api/llm/v1/chat/completions/lib/request-processor.ts')).toMatch(
      /const MANAGED_WEB_CLOUD_TRUST_MODE = 'managed_cloud';/u,
    );
    for (const id of [
      'desktop-and-cli',
      'getting-started',
      'local-mode',
      'providers-and-models',
      'install-desktop-and-mobile',
    ]) {
      expect(collapsed(`content/support/${id}.md`)).toContain(
        'The current Desktop application is managed-cloud-only and does not accept provider keys or run local models.',
      );
    }
  });

  it('does not infer whole-application privacy or provider billing from a local or API-key route', () => {
    for (const id of ['getting-started', 'local-mode']) {
      const article = collapsed(`content/support/${id}.md`);
      expect(article).not.toMatch(
        /conversation content never leaves your device|traffic goes directly to your provider|no markup|keys stay in the surface's private credential store/iu,
      );
    }
    expect(collapsed('content/support/local-mode.md')).toContain(
      'Review the permissions and destination of each tool or connector before using it.',
    );
  });

  it('describes the real review and apply handlers without promising an entire diff workflow', () => {
    const commands = repoText('apps', 'cli', 'src', 'lib.rs');
    const review = repoText('apps', 'cli', 'src', 'review.rs');
    const apply = repoText('apps', 'cli', 'src', 'apply_patch.rs');
    expect(commands).toContain('review::run_review(&app_config, &sys_ctx, &opts).await?;');
    expect(review).toContain('let diff = gather_diff(options).await?;');
    expect(review).toContain('session.send(config, &prompt, Box::new(|_chunk| {})).await?;');
    expect(apply).toMatch(/pub async fn apply_from_file[\s\S]{0,180}apply_git_patch/u);
    expect(apply).toMatch(/pub async fn apply_from_session[\s\S]{0,550}apply_git_patch/u);
    const article = collapsed('content/support/vscode-extension.md');
    expect(article).toContain('`agi review` sends a Git diff to the selected model for review.');
    expect(article).toContain('`agi apply` applies a diff from a file or saved session.');
    expect(article).not.toContain('cover the diff workflow');
  });

  it('keeps model-route boundary and reviewed-continuation statements scoped to the CLI', () => {
    const agent = repoText('apps', 'cli', 'src', 'agent', 'mod.rs');
    const chat = repoText('apps', 'cli', 'src', 'agent', 'chat.rs');
    const start = agent.indexOf('pub fn validate_privacy_boundary');
    const end = agent.indexOf('pub fn apply_output_style', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const boundary = agent.slice(start, end);
    expect(boundary).toContain('if self.privacy_mode != provider_mode');
    expect(boundary).toContain('anyhow::bail!(');
    expect(chat).toContain(
      'self.complete_pending_privacy_handoff(user_input)?;\n        self.validate_privacy_boundary()?;',
    );
    const completion = agent.indexOf('fn complete_pending_privacy_handoff_with_store');
    expect(completion).toBeGreaterThan(-1);
    expect(completion).toBeLessThan(start);
    const handoff = agent.slice(completion, start);
    expect(handoff).toContain('if user_input.trim() != pending.reviewed_payload');
    expect(handoff).toContain('self.pending_privacy_handoff = None;');
    expect(handoff).toContain('store.fork_redacted_continuation(');
    expect(handoff).toContain('self.adopt_managed_session(destination, destination_path)?;');
    for (const id of ['getting-started', 'local-mode', 'providers-and-models']) {
      const article = collapsed(`content/support/${id}.md`);
      expect(article).toContain(
        "The CLI refuses a model request when the session's trust mode and provider route differ.",
      );
      expect(article).toContain(
        'A reviewed Local continuation requires a matching payload preview and creates a new destination session.',
      );
    }
  });

  it('keeps the provider article counts on the existing provider-key catalog scope', () => {
    const scope = fileText('lib/catalog-scopes.ts');
    const corpus = fileText('lib/support/agent/corpus/index.ts');
    expect(scope).toContain('modelEntries.filter((model) => byokProviderIds.has(model.provider))');
    expect(scope).toMatch(/byokModelEntries: scope\(\s*byokEntries.length/u);
    expect(scope).toMatch(/byokProviders: scope\(\s*BYOK_PROVIDER_IDS.length/u);
    expect(corpus).toContain(
      "'MARKETING.models.display': String(CATALOG_SCOPES.byokModelEntries.value)",
    );
    expect(corpus).toContain(
      "'MARKETING.providers.display': String(CATALOG_SCOPES.byokProviders.value)",
    );
    const article = collapsed('content/support/providers-and-models.md');
    expect(article).toContain(
      'The provider-key catalog contains {{MARKETING.models.display}} model entries under {{MARKETING.providers.display}} provider integrations.',
    );
    expect(article).toContain(
      'These are catalog counts rather than a list of models offered to every account.',
    );
    expect(article).not.toMatch(
      /models are available across those providers|AGI supports .* provider integrations, including/u,
    );
  });

  it('keeps VS Code account-key controls separate from model-provider keys', () => {
    const setup = repoText('apps', 'extension-vscode', 'src', 'core', 'commandSetup.ts');
    const manifest = JSON.parse(repoText('apps', 'extension-vscode', 'package.json')) as {
      contributes: { commands: Array<{ command: string; title: string }> };
    };
    for (const [command, label] of [
      ['explain', 'Explain Selection'],
      ['fix', 'Fix Issue'],
      ['refactor', 'Refactor Code'],
      ['generateTests', 'Generate Tests'],
    ]) {
      expect(manifest.contributes.commands).toContainEqual(
        expect.objectContaining({
          command: `agi-workforce.${command}`,
          title: `AGI Workforce: ${label}`,
        }),
      );
      expect(setup).toContain(`register('agi-workforce.${command}',`);
    }
    const start = setup.indexOf("register('agi-workforce.setApiKey',");
    const end = setup.indexOf("register('agi-workforce.selectModel',", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const credentials = setup.slice(start, end);
    expect(credentials).toContain('Enter your AGI Workforce API key.');
    expect(credentials).toContain('await setApiKey(context.secrets, apiKey.trim());');
    expect(credentials).toContain('await clearApiKey(context.secrets);');
    expect(setup).toContain('const result = await localRuntimes.restartAll();');
    expect(setup).toContain('const result = await probeCli(cliPath, runCliVersion);');
    const article = collapsed('content/support/vscode-extension.md');
    expect(article).toContain(
      '**Set API Key** and **Clear API Key** manage the AGI Workforce account API key.',
    );
    expect(article).toContain(canonicalSupportUrl('/help/byok-provider-keys'));
    expect(article).not.toMatch(
      /Clear API Key\*\* manage BYOK|manages a model running on your machine|same kind of object as one started on the web/u,
    );
  });

  it('requires selected code for all four documented editor commands', () => {
    const setup = repoText('apps', 'extension-vscode', 'src', 'core', 'commandSetup.ts');
    const explain = repoText(
      'apps',
      'extension-vscode',
      'src',
      'features',
      'editor-utilities',
      'editorUtilities.ts',
    );
    const inline = repoText('apps', 'extension-vscode', 'src', 'core', 'runInlineCommand.ts');
    expect(setup).toContain('await runEditorUtility(buildExplainSelectionPrompt(targetRange));');
    for (const command of ['fix', 'refactor', 'tests']) {
      expect(setup).toContain(`await runInlineCommand(context, '${command}', targetRange);`);
    }
    expect(explain).toContain(
      'const range = targetRange ?? (editor.selection.isEmpty ? undefined : editor.selection);',
    );
    expect(explain).toContain(
      "if (range === undefined) return { ok: false, message: 'Select some code first.' };",
    );
    expect(explain).toContain(
      "if (selected.trim() === '') return { ok: false, message: 'Select some code first.' };",
    );
    expect(inline).toContain(
      'const explicitRange = targetRange ?? (selection.isEmpty ? undefined : selection);',
    );
    expect(inline).toMatch(
      /if \(explicitRange === undefined\) \{\s*vscode\.window\.showWarningMessage\('AGI Workforce: Select some code first\.'\);\s*return;/u,
    );
    expect(inline).toMatch(
      /if \(selectedText\.trim\(\) === ''\) \{\s*vscode\.window\.showWarningMessage\('AGI Workforce: Select some code first\.'\);\s*return;/u,
    );
    const article = collapsed('content/support/vscode-extension.md');
    expect(article).toContain(
      'Select code in the active editor, choose a command, and review its output before applying a change.',
    );
    expect(article).not.toContain('selected code or current file');
  });
});
