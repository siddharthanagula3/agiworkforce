import { Template, defaultBuildLogger } from '@e2b/code-interpreter';

const TEMPLATE_NAME = 'agi-office-interpreter';
const OFFICE_PACKAGES = [
  'libreoffice-writer',
  'libreoffice-calc',
  'libreoffice-impress',
  'fonts-dejavu',
  'fonts-liberation',
  'fonts-noto-core',
];

async function main() {
  if (!process.env.E2B_API_KEY) {
    console.error('E2B_API_KEY is not set. Set it in the environment (never in chat / git).');
    process.exit(2);
  }

  const template = Template()
    .fromTemplate('code-interpreter-v1')
    .aptInstall(OFFICE_PACKAGES, { noInstallRecommends: true });

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
