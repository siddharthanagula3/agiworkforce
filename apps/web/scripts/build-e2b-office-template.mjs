import { Template, defaultBuildLogger } from '@e2b/code-interpreter';

const TEMPLATE_NAME = process.env.AGI_E2B_OFFICE_BUILD_ALIAS?.trim() || 'agi-office-interpreter';
if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(TEMPLATE_NAME)) {
  throw new Error(
    'AGI_E2B_OFFICE_BUILD_ALIAS must be a lowercase template alias (3–64 characters).',
  );
}
const OFFICE_PACKAGES = [
  'libreoffice-writer',
  'libreoffice-calc',
  'libreoffice-impress',
  'poppler-utils',
  'fonts-dejavu',
  'fonts-liberation',
  'fonts-noto-core',
];

async function main() {
  const template = Template()
    .fromTemplate('code-interpreter-v1')
    .aptInstall(OFFICE_PACKAGES, { noInstallRecommends: true });
  if (process.argv.includes('--dry-run')) {
    console.log(await Template.toJSON(template));
    return;
  }

  if (!process.env.E2B_API_KEY) {
    console.error('E2B_API_KEY is not set. Set it in the environment (never in chat / git).');
    process.exit(2);
  }

  const build = await Template.build(template, TEMPLATE_NAME, {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(
    `Built ${TEMPLATE_NAME} (${build.templateId}). Set AGI_E2B_CHAT_TEMPLATE=${TEMPLATE_NAME}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
