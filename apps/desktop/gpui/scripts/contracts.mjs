import projectContract from '../../../../packages/contracts/cloud-contracts/src/project-contract.json' with { type: 'json' };
import conversationContract from '../../../../packages/contracts/cloud-contracts/src/conversation-contract.json' with { type: 'json' };
import { PRODUCT_NAMES } from '../../../../packages/contracts/types/src/product-names.ts';
import fs from 'node:fs';
import { URL } from 'node:url';
import { AGI_WORK_MODE } from '../../../../packages/contracts/types/src/runtime.ts';
import { formatPrivacyModeLabel } from '../../../../packages/contracts/types/src/suite-contracts.ts';
import {
  agiPalette,
  agiChatTypography,
  agiChatFrameGeometry,
  agiModelPickerGeometry,
  agiTerminalIndexedColors,
} from '../../../../packages/ui/design-tokens/src/index.ts';
import {
  DEVELOPER_SESSION_MAX_FRAME_BYTES,
  DEVELOPER_SESSION_TRUST_LABELS,
  GUARD_LIFTING_ENVIRONMENT,
} from '../../../../packages/contracts/local-runtime/src/developer-sessions.ts';

function color(value) {
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`Expected a six-digit color: ${value}`);
  return Number.parseInt(value.slice(1), 16);
}

function palette(value) {
  return {
    background: color(value.surface.base),
    sidebar: color(value.surface.sidebar),
    hover: color(value.surface.hover),
    foreground: color(value.text.primary),
    secondary: color(value.text.secondary),
    danger: color(value.stateText.danger),
    code: color(value.surface.code),
  };
}

const foundation = fs.readFileSync(
  new URL('../../../../packages/ui/design-tokens/src/foundation.css', import.meta.url),
  'utf8',
);
function pixelToken(name) {
  const match = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px;`).exec(foundation);
  if (!match) throw new Error(`The canonical ${name} must be a pixel value.`);
  return Number(match[1]);
}

process.stdout.write(
  JSON.stringify({
    desktopName: PRODUCT_NAMES.desktop,
    chatName: PRODUCT_NAMES.chat,
    codeName: PRODUCT_NAMES.code,
    workName: PRODUCT_NAMES.work,
    workMode: AGI_WORK_MODE,
    cloudTrustLabel: formatPrivacyModeLabel('managed'),
    light: palette(agiPalette.light),
    dark: palette(agiPalette.dark),
    terminalColors: {
      light: agiTerminalIndexedColors('light').map(color),
      dark: agiTerminalIndexedColors('dark').map(color),
    },
    bodyFontSize: agiChatTypography.body.fontSize,
    modelPicker: agiModelPickerGeometry,
    frame: agiChatFrameGeometry,
    panelRadius: pixelToken('--corner-panel'),
    strokeWidth: pixelToken('--stroke-hairline'),
    conversationTitleMaxLength: conversationContract.titleMaxLength,
    projectNameMaxLength: projectContract.nameMaxLength,
    projectDescriptionMaxLength: projectContract.descriptionMaxLength,
    projectInstructionsMaxLength: projectContract.instructionsMaxLength,
    draftMaxLength: conversationContract.draftMaxLength,
    draftSaveDebounceMs: conversationContract.draftSaveDebounceMs,
    bodyLineHeight: agiChatTypography.body.lineHeight,
    headingFontSizes: [
      agiChatTypography.heading1.fontSize,
      agiChatTypography.heading2.fontSize,
      agiChatTypography.heading3.fontSize,
    ],
    maxFrameBytes: DEVELOPER_SESSION_MAX_FRAME_BYTES,
    trustLabels: DEVELOPER_SESSION_TRUST_LABELS,
    guardLiftingEnvironment: GUARD_LIFTING_ENVIRONMENT,
  }),
);
import process from 'node:process';
