/**
 * A Model Studio key is issued against exactly ONE of Alibaba's two
 * deployments, and the other answers `401 Incorrect API key provided`, the
 * same response as a genuinely bad key, with nothing naming the region. Getting
 * this constant wrong therefore looks like a credential problem and is not
 * discoverable from the error.
 *
 * International is the default because that is the deployment this product's
 * accounts are issued against; the mainland endpoint requires a separate
 * mainland Model Studio account. A mainland operator sets QWEN_BASE_URL, which
 * is allowlisted to both hosts.
 *
 * Verified 2026-08-30 against the live API with one key:
 *   dashscope-intl.aliyuncs.com -> 200
 *   dashscope.aliyuncs.com      -> 401 Incorrect API key provided
 *
 * Both compatible-mode URLs are registered in
 * `openai-responses-payload-policy.ts`'s MODELSTUDIO_NATIVE_BASE_URLS, so the
 * `modelstudio-native` endpoint class and its streaming-usage compat hold for
 * either region.
 */
export const QWEN_DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
