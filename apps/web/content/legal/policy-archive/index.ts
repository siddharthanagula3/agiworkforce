import terms_2026_08_11 from './terms/2026-08-11.json';
import privacy_2026_09_12 from './privacy/2026-09-12.json';
import privacy_2026_09_21 from './privacy/2026-09-21.json';
import privacy_2026_09_22 from './privacy/2026-09-22.json';
import privacy_2026_09_27 from './privacy/2026-09-27.json';
import acceptableUse_2026_08_05 from './acceptableUse/2026-08-05.json';
import acceptableUse_2026_09_22 from './acceptableUse/2026-09-22.json';
import cookies_2026_09_12 from './cookies/2026-09-12.json';
import subprocessors_2026_09_12 from './subprocessors/2026-09-12.json';
import subprocessors_2026_09_21 from './subprocessors/2026-09-21.json';
import subprocessors_2026_09_22 from './subprocessors/2026-09-22.json';
import refunds_2026_08_13 from './refunds/2026-08-13.json';
import accessibility_2026_08_05 from './accessibility/2026-08-05.json';
import trust_2026_09_12 from './trust/2026-09-12.json';
import mobile_2026_08_13 from './mobile/2026-08-13.json';
import mobile_2026_09_21 from './mobile/2026-09-21.json';
import copyright_2026_08_06 from './copyright/2026-08-06.json';
import agentPermissions_2026_09_02 from './agentPermissions/2026-09-02.json';
import agentPermissions_2026_09_22 from './agentPermissions/2026-09-22.json';

export const ARCHIVED_POLICY_TEXT = {
  terms: {
    '2026-08-11': terms_2026_08_11,
  },
  privacy: {
    '2026-09-12': privacy_2026_09_12,
    '2026-09-21': privacy_2026_09_21,
    '2026-09-22': privacy_2026_09_22,
    '2026-09-27': privacy_2026_09_27,
  },
  acceptableUse: {
    '2026-08-05': acceptableUse_2026_08_05,
    '2026-09-22': acceptableUse_2026_09_22,
  },
  cookies: {
    '2026-09-12': cookies_2026_09_12,
  },
  subprocessors: {
    '2026-09-12': subprocessors_2026_09_12,
    '2026-09-21': subprocessors_2026_09_21,
    '2026-09-22': subprocessors_2026_09_22,
  },
  refunds: {
    '2026-08-13': refunds_2026_08_13,
  },
  accessibility: {
    '2026-08-05': accessibility_2026_08_05,
  },
  trust: {
    '2026-09-12': trust_2026_09_12,
  },
  mobile: {
    '2026-08-13': mobile_2026_08_13,
    '2026-09-21': mobile_2026_09_21,
  },
  copyright: {
    '2026-08-06': copyright_2026_08_06,
  },
  agentPermissions: {
    '2026-09-02': agentPermissions_2026_09_02,
    '2026-09-22': agentPermissions_2026_09_22,
  },
} as const;
