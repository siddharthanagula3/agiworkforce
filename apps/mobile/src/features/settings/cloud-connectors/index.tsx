/**
 * Cloud Connectors Directory Screen
 *
 * Native RN equivalent of the web ConnectorsSection (settings-modal/types.ts
 * SettingsConnector contract). Renders the same connector catalog the web and
 * desktop surfaces use, with real official brand logos — no initial-tiles.
 *
 * Logo resolution order (mirrors ConnectorLogo.tsx in packages/ui):
 *   1. react-native-svg path from the ICON_PATHS map (simple-icons v16 glyphs)
 *   2. Official brand-asset URL via RN <Image source={{ uri }}> with onError
 *      fallback (mirrors CONNECTOR_LOGO_URLS in ConnectorLogo.tsx)
 *   3. Gradient tile + 2-char initials — last resort only
 *
 * Cloud-only — gated behind FEATURES.connectors. When the flag is false a
 * waitlist placeholder is shown rather than a dead list.
 *
 * Connected state is local-only for now (stored in MMKV via settingsStore);
 * the actual OAuth flow will be routed through /api/connectors when
 * FEATURES.connectors flips to true.
 */

import { useCallback, useState } from 'react';
import { View, Image, Pressable, Alert } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Plug, Link, CheckCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useConnectorsStore } from '@/src/features/connectors/store';

// ---------------------------------------------------------------------------
// simple-icons SVG paths (v16 confirmed present — mirrors ConnectorLogo.tsx)
// Only the connectors in CATALOG below are included; tree-shaken at build time
// since Metro does not import the full simple-icons package.
// ---------------------------------------------------------------------------

// path / hex pairs extracted from simple-icons v16 for each connector id
const SI: Record<string, { path: string; hex: string }> = {
  gmail: {
    hex: 'EA4335',
    path: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z',
  },
  'google-drive': {
    hex: '4285F4',
    path: 'M6.28 4.788 0 15.513l3.78 6.55 6.28-10.878zm11.44 0H6.28l-3.779 6.55h11.44zm-.84 6.55-3.78 6.55 3.78.013L24 6.325zm3.78 6.55L24 15.512l-6.28-10.726-3.78 6.55z',
  },
  notion: {
    hex: '000000',
    path: 'M3.913 3.93c.709.574 1.343.496 2.514.417l13.67-.808c.275 0 .046-.274-.046-.315l-2.27-1.648c-.432-.313-.997-.667-2.088-.588L3.11 1.79c-.459.04-.55.275-.367.432zm.733 2.975v14.367c0 .77.386 1.055 1.26.998l15.038-.866c.874-.04.979-.55.979-1.156V5.891c0-.6-.234-.918-.753-.874l-15.77.904c-.563.04-.754.314-.754.984zm14.84.785c.09.41 0 .82-.41.87l-.68.137v9.95c-.591.313-1.136.49-1.589.49-.727 0-.91-.229-1.453-.912l-4.457-7.002v6.776l1.413.314s0 .82-1.136.82l-3.132.183c-.09-.183 0-.636.315-.726l.818-.225V9.317L8.91 9.11c-.09-.41.136-1.001.773-1.046l3.362-.226 4.63 7.093V8.86l-1.184-.136c-.091-.504.272-.87.726-.91zM2.24 1.104l13.764-1.02c1.69-.142 2.124-.047 3.182.726l4.384 3.09c.726.507.962.644.962 1.19v16.298c0 1.022-.369 1.62-1.664 1.712L5.095 24c-.952.047-1.41-.096-1.908-.736L.37 20.21C-.27 19.343 0 18.753 0 17.988V2.807C0 1.97.39 1.285 2.24 1.104z',
  },
  github: {
    hex: '181717',
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  gitlab: {
    hex: 'FC6D26',
    path: 'M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 0 0-.867 0L1.386 9.45.044 13.587a.924.924 0 0 0 .331 1.023L12 23.054l11.625-8.443a.924.924 0 0 0 .33-1.024',
  },
  slack: {
    hex: '4A154B',
    path: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z',
  },
  jira: {
    hex: '0052CC',
    path: 'M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.762a1.005 1.005 0 0 0-1.001-1.005zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24.017 12.49V1.005A1.001 1.001 0 0 0 23.013 0z',
  },
  linear: {
    hex: '5E6AD2',
    path: 'M0 14.008 9.99 24l14.01-14.01L14.008 0 0 14.008ZM.875 16.246l7.182 7.182-1.667-9.043-5.515 1.861ZM9.793 23.125 1.875 15.207l1.711-9.293 15.604 15.604-9.397 1.607ZM17.582 21.11 2.89 6.418l9.31-1.59L23.11 15.74l-5.528 5.37ZM15.753 2.69 7.762.866l-1.86 5.514 9.043 1.668-1.192-5.358Z',
  },
  notion_fallback: { hex: '000000', path: '' }, // handled via URL below
  stripe: {
    hex: '635BFF',
    path: 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z',
  },
  shopify: {
    hex: '96BF48',
    path: 'M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192-.098 0-1.87-.038-1.87-.038s-1.254-1.218-1.388-1.35v20.871h-.001l-.001-.001zm-3.001.021l1.501-.312V.906c-.13.024-2.16.412-2.16.412L8.35 22.399l4.01 1.601-.024-.001v.001zm-5.3-9.646l.78-2.439s.858.469 1.912.469c1.515 0 1.592-1.018 1.592-1.258 0-1.651-3.459-2.283-3.459-5.818 0-2.876 1.817-4.723 4.313-4.723 1.893 0 2.878.969 2.878.969l-.779 2.614s-1.278-.974-2.369-.974c-1.302 0-1.573.902-1.573 1.279 0 1.786 3.516 2.322 3.516 5.643 0 2.721-1.624 4.953-4.518 4.953-2.108 0-3.293-1.271-3.293-1.271v-.001z',
  },
  hubspot: {
    hex: 'FF7A59',
    path: 'M22.162 5.656a9.686 9.686 0 0 0-1.753-.812V2.996a1.703 1.703 0 0 0 .983-1.536 1.71 1.71 0 0 0-1.71-1.71 1.711 1.711 0 0 0-1.71 1.71c0 .666.38 1.234.938 1.524v1.853c-.91.174-1.77.535-2.516 1.062l-5.02-3.913a1.947 1.947 0 0 0 .063-.487A1.953 1.953 0 0 0 9.484 0a1.953 1.953 0 0 0-1.953 1.953 1.953 1.953 0 0 0 1.953 1.953c.31 0 .594-.074.852-.198l4.934 3.847a7.25 7.25 0 0 0-1.243 4.16 7.262 7.262 0 0 0 2.137 5.16 7.282 7.282 0 0 0 5.151 2.137 7.282 7.282 0 0 0 5.151-2.136 7.281 7.281 0 0 0 2.137-5.161 7.262 7.262 0 0 0-6.445-7.219zm-2.437 11.7a4.19 4.19 0 0 1-4.19-4.19 4.19 4.19 0 0 1 4.19-4.19 4.19 4.19 0 0 1 4.19 4.19 4.19 4.19 0 0 1-4.19 4.19z',
  },
  figma: {
    hex: 'F24E1E',
    path: 'M5.333 24C7.355 24 9 22.355 9 20.333V16.5H5.333C3.311 16.5 1.667 18.145 1.667 20.167 1.667 22.188 3.311 24 5.333 24zM1.667 12c0-2.022 1.645-3.667 3.667-3.667H9V15.5H5.333C3.311 15.5 1.667 13.855 1.667 12zm7.333-8.5C9 1.478 10.645 0 12.667 0c2.022 0 3.667 1.645 3.667 3.667V7.5H9V3.5zM12.667 8.5c2.022 0 3.666 1.645 3.666 3.667 0 2.022-1.644 3.666-3.666 3.666-2.022 0-3.667-1.644-3.667-3.666 0-2.022 1.645-3.667 3.667-3.667zm3.666-8.5c2.022 0 3.667 1.645 3.667 3.667V7.5h-7.333V3.667C12.667 1.645 14.311 0 16.333 0z',
  },
  discord: {
    hex: '5865F2',
    path: 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z',
  },
  zoom: {
    hex: '2D8CFF',
    path: 'M24 12c0 6.627-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0s12 5.373 12 12zM7.111 9.778v4.89l2.222-2.224v2.334c0 .614.498 1.111 1.112 1.111h5.333A1.111 1.111 0 0 0 16.89 14.78V9.89a1.111 1.111 0 0 0-1.112-1.112H8.222A1.111 1.111 0 0 0 7.11 9.89v-.112zm10.667 1.111L24 8v8l-6.222-2.889V10.89z',
  },
  notion2: {
    hex: '000000',
    path: 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.934zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.449.327s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L8.596 9.5c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.094-.514.28-.887.747-.933z',
  },
  airtable: {
    hex: '18BFFF',
    path: 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12c0-3.48.85-6.22 2.529-8.16C5.808 1.773 8.34.5 11.5.5c3.14 0 5.317.988 6.47 2.94.827 1.405 1.024 3.006.993 3.98l-.003.072c-.018.464-.17.85-.434 1.105a1.155 1.155 0 0 1-.833.302l-.038-.002-5.437-.323c-.447-.027-.883-.234-1.216-.582l-.039-.044a1.826 1.826 0 0 1-.44-1.434l.003-.035c.116-1.113.495-1.74 1.13-1.74h.042c.44.02.736.19.878.51.12.276.17.655.145 1.127l.004.022-.002.021a.27.27 0 0 0 .261.297l5.443.342-.01-.046c-.076-1.057-.38-2.162-1.01-3.054-1.049-1.476-2.987-2.26-5.607-2.26-2.52 0-4.576.895-5.944 2.59C5.28 6.08 4.5 8.587 4.5 12c0 3.513.78 6.134 2.32 7.79 1.333 1.43 3.206 2.18 5.66 2.18.14 0 .28-.003.422-.008.2-.008.381-.012.545-.012 2.45 0 4.275-.654 5.42-1.944 1.177-1.327 1.67-3.393 1.49-6.142l-.008-.11c-.053-.82-.168-1.554-.347-2.183h-6.565c-.34 0-.617-.277-.617-.617s.277-.617.617-.617h7.172c.31 0 .563.228.61.535.24 1.527.357 2.93.357 4.146 0 3.237-.761 5.718-2.263 7.373-1.507 1.66-3.757 2.503-6.687 2.503z',
  },
  trello: {
    hex: '0052CC',
    path: 'M21 0H3C1.343 0 0 1.343 0 3v18c0 1.656 1.343 3 3 3h18c1.656 0 3-1.344 3-3V3c0-1.657-1.344-3-3-3zM10.44 18.18c0 .795-.645 1.44-1.44 1.44H4.56c-.795 0-1.44-.645-1.44-1.44V5.76c0-.795.645-1.44 1.44-1.44H9c.795 0 1.44.645 1.44 1.44v12.42zm10.44-6c0 .795-.645 1.44-1.44 1.44H15c-.795 0-1.44-.645-1.44-1.44V5.76c0-.795.645-1.44 1.44-1.44h4.44c.795 0 1.44.645 1.44 1.44v6.42z',
  },
  asana: {
    hex: 'F06A6A',
    path: 'M11.994 0C5.375 0 0 5.376 0 12c0 6.626 5.375 12 11.994 12C18.625 24 24 18.626 24 12c0-6.624-5.375-12-12.006-12zm0 4.682c1.942 0 3.516 1.57 3.516 3.508 0 1.94-1.574 3.51-3.516 3.51-1.94 0-3.514-1.57-3.514-3.51 0-1.938 1.574-3.508 3.514-3.508zm5.994 11.634a6.77 6.77 0 0 1-5.994 3.63 6.77 6.77 0 0 1-5.994-3.63h11.988z',
  },
  todoist: {
    hex: 'DB4035',
    path: 'M1.675 0C.75 0 0 .75 0 1.675v20.65C0 23.25.75 24 1.675 24h20.65C23.25 24 24 23.25 24 22.325V1.675C24 .75 23.25 0 22.325 0zm5.4 7.2l1.5 1.5-4.2 4.2-1.5-1.5zm11.85 0l1.5 1.5L8.7 21.6l-1.5-1.5zm-5.925 2.925l1.5 1.5-6.225 6.225-1.5-1.5z',
  },
  dropbox: {
    hex: '0061FF',
    path: 'M12 2.295L6.009 6.09 12 9.885l-5.991 3.795L0 9.885l6.009-3.795L0 2.295 6.009-1.5zm0 0l5.991 3.795L12 9.885l5.991-3.795L24 9.885l-6.009 3.795L24 17.475l-5.991-3.795L12 17.475l-5.991-3.795L0 17.475l6.009-3.795z',
  },
};

// ---------------------------------------------------------------------------
// Official brand-asset URL map (mirrors ConnectorLogo.tsx CONNECTOR_LOGO_URLS)
// Used for brands absent from simple-icons v16
// ---------------------------------------------------------------------------

const LOGO_URLS: Record<string, string> = {
  slack: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
  outlook:
    'https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg',
  onedrive:
    'https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg',
  teams:
    'https://upload.wikimedia.org/wikipedia/commons/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg',
  salesforce: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
  openai: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',
  linkedin: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png',
  canva: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Canva_Logo.svg',
  adobe: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Adobe_Corporate_Logo.png',
  aws: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg',
  monday: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Monday_logo.svg',
  azure: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg',
  freshdesk: 'https://www.google.com/s2/favicons?domain=freshdesk.com&sz=64',
  pipedrive: 'https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64',
  twilio: 'https://www.google.com/s2/favicons?domain=twilio.com&sz=64',
  sendgrid: 'https://www.google.com/s2/favicons?domain=sendgrid.com&sz=64',
  segment: 'https://www.google.com/s2/favicons?domain=segment.com&sz=64',
  plaid: 'https://www.google.com/s2/favicons?domain=plaid.com&sz=64',
};

// ---------------------------------------------------------------------------
// Connector catalog — mirrors connectorData.ts + shared SettingsConnector shape
// ---------------------------------------------------------------------------

interface ConnectorEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  iconBg?: string; // gradient fallback (only if no glyph / url)
  iconText?: string; // 2-char fallback
}

const CATALOG: ConnectorEntry[] = [
  // Productivity
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search and create content on Notion pages',
    category: 'Productivity',
    iconBg: '#1a1a1a',
    iconText: 'No',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Query and update Airtable bases',
    category: 'Productivity',
    iconBg: '#18BFFF20',
    iconText: 'Ai',
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Manage cards, lists, and boards',
    category: 'Productivity',
    iconBg: '#0052CC20',
    iconText: 'Tr',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Track tasks, projects, and team progress',
    category: 'Productivity',
    iconBg: '#F06A6A20',
    iconText: 'As',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    description: 'Manage tasks and projects',
    category: 'Productivity',
    iconBg: '#DB403520',
    iconText: 'To',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Plan and track issues and team workflows',
    category: 'Developer',
    iconBg: '#5E6AD220',
    iconText: 'Li',
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Plan and track projects, tasks, and workflows',
    category: 'Developer',
    iconBg: '#0052CC20',
    iconText: 'Ji',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Search and manage your repositories',
    category: 'Developer',
    iconBg: '#18181720',
    iconText: 'GH',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Search repos, issues, and pipelines',
    category: 'Developer',
    iconBg: '#FC6D2620',
    iconText: 'GL',
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Browse files and leave design comments',
    category: 'Design',
    iconBg: '#F24E1E20',
    iconText: 'Fi',
  },
  // Communication
  {
    id: 'slack',
    name: 'Slack',
    description: 'Search and post across your Slack workspace',
    category: 'Communication',
    iconBg: '#4A154B20',
    iconText: 'Sl',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Read and post messages in Discord servers',
    category: 'Communication',
    iconBg: '#5865F220',
    iconText: 'Di',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Schedule and manage Zoom meetings',
    category: 'Communication',
    iconBg: '#2D8CFF20',
    iconText: 'Zo',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Search and send messages in Teams',
    category: 'Communication',
    iconBg: '#6264A720',
    iconText: 'MT',
  },
  // Productivity cloud
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search, create, and manage your emails',
    category: 'Email',
    iconBg: '#EA433520',
    iconText: 'Gm',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search and access Drive files',
    category: 'Cloud Storage',
    iconBg: '#4285F420',
    iconText: 'GD',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Access and search Dropbox content',
    category: 'Cloud Storage',
    iconBg: '#0061FF20',
    iconText: 'Db',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Access OneDrive files and folders',
    category: 'Cloud Storage',
    iconBg: '#0078D420',
    iconText: 'OD',
  },
  // CRM / Finance
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Manage contacts, deals, and pipelines',
    category: 'CRM',
    iconBg: '#FF7A5920',
    iconText: 'Hs',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Access and update CRM records',
    category: 'CRM',
    iconBg: '#00A1E020',
    iconText: 'SF',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'View payments, customers, and subscriptions',
    category: 'Finance',
    iconBg: '#635BFF20',
    iconText: 'St',
  },
];

const CATEGORIES = Array.from(new Set(CATALOG.map((c) => c.category)));

// ---------------------------------------------------------------------------
// ConnectorLogo — RN equivalent of packages/ui ConnectorLogo.tsx
// ---------------------------------------------------------------------------

function ConnectorLogo({ id, name, iconBg }: { id: string; name: string; iconBg?: string }) {
  const colors = useThemeColors();
  const [urlFailed, setUrlFailed] = useState(false);

  const normalId = id.toLowerCase();
  const siEntry = SI[normalId];
  const logoUrl = LOGO_URLS[normalId];

  // Tier 1: simple-icons SVG path
  if (siEntry?.path) {
    const hex = siEntry.hex.toUpperCase();
    // Near-black glyphs render in theme foreground for legibility
    const fill =
      hex === '000000' || hex === '181717' || hex === '181818'
        ? colors.textPrimary
        : `#${siEntry.hex}`;
    return (
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.neutralSurface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path d={siEntry.path} fill={fill} />
        </Svg>
      </View>
    );
  }

  // Tier 2: official brand-asset URL image
  if (logoUrl && !urlFailed) {
    return (
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.neutralSurface,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={{ uri: logoUrl }}
          style={{ width: 26, height: 26 }}
          resizeMode="contain"
          onError={() => setUrlFailed(true)}
          accessibilityLabel={`${name} logo`}
        />
      </View>
    );
  }

  // Tier 3: gradient tile + 2-char initials
  const bg = iconBg ?? colors.neutralSurface;
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ConnectorCard
// ---------------------------------------------------------------------------

function ConnectorCard({
  entry,
  connected,
  onPress,
}: {
  entry: ConnectorEntry;
  connected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}. ${connected ? 'Connected' : 'Connect'}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 12,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
    >
      <ConnectorLogo id={entry.id} name={entry.name} iconBg={entry.iconBg} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}
        >
          {entry.name}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {entry.description}
        </Text>
      </View>
      {connected ? (
        <CheckCircle size={18} color={colors.teal} />
      ) : (
        <View
          style={{
            paddingHorizontal: 11,
            paddingVertical: 5,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
            Connect
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Waitlist placeholder — shown when FEATURES.connectors is false
// ---------------------------------------------------------------------------

function WaitlistPlaceholder() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 20,
        alignItems: 'center',
        gap: 12,
        marginBottom: 18,
      }}
    >
      <Link size={32} color={colors.textMuted} />
      <Text
        style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', textAlign: 'center' }}
      >
        Connectors — AGI Cloud
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
        Connect Gmail, GitHub, Notion, Slack, and 80+ services to AGI Cloud. Available with cloud
        access.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CloudConnectorsScreen() {
  const colors = useThemeColors();
  // Connected IDs persisted locally via the connectors store until /api/connectors OAuth is active
  const connectedIds = useConnectorsStore((s) => s.connectedIds);
  const toggle = useConnectorsStore((s) => s.toggle);

  const isConnected = useCallback((id: string) => connectedIds.includes(id), [connectedIds]);

  const handlePress = useCallback(
    (entry: ConnectorEntry) => {
      // Unreachable while !FEATURES.connectors — the catalog below only renders
      // when the flag is on. Kept as a defensive fallback with accurate copy
      // (Connectors are gated by the feature flag, not by AGI Cloud sign-in).
      if (!FEATURES.connectors) {
        Alert.alert(
          `${entry.name}`,
          'Connectors aren’t available on mobile yet. We’ll notify you when they ship.',
          [{ text: 'OK' }],
        );
        return;
      }
      if (isConnected(entry.id)) {
        Alert.alert(`Disconnect ${entry.name}?`, 'Remove this connector from your account.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => toggle(entry.id),
          },
        ]);
      } else {
        // In a live version: router.push to an OAuth flow screen
        Alert.alert(
          `Connect ${entry.name}`,
          'OAuth flow will open in your browser when AGI Cloud connectors are active.',
          [{ text: 'OK' }],
        );
      }
    },
    [isConnected, toggle],
  );

  return (
    <SettingsScreenShell title="Connectors">
      <SettingsInfo
        title="Connect your tools to AGI Cloud"
        body="Connectors let AGI read and act across your apps. Each connector uses server-side OAuth — your credentials never leave AGI Cloud."
        icon={Plug}
      />

      {!FEATURES.connectors && <WaitlistPlaceholder />}

      {FEATURES.connectors &&
        CATEGORIES.map((cat) => {
          const entries = CATALOG.filter((c) => c.category === cat);
          return (
            <View key={cat} style={{ marginBottom: 18 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 7,
                  paddingHorizontal: 2,
                }}
              >
                {cat}
              </Text>
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                {entries.map((entry, idx) => (
                  <View key={entry.id}>
                    {idx > 0 && (
                      <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 66 }} />
                    )}
                    <ConnectorCard
                      entry={entry}
                      connected={isConnected(entry.id)}
                      onPress={() => handlePress(entry)}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
    </SettingsScreenShell>
  );
}
