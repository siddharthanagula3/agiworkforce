import { getAllowedModelsForTier, modelsCatalog } from '@agiworkforce/types';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
import {
  CATALOG_AS_OF,
  CLI_LOCAL_RUNTIME_IDS,
  LOCAL_RUNTIME_LABEL_SUFFIX,
} from './marketing-constants';

export interface CatalogScope {
  readonly value: number;
  readonly label: string;
  readonly text: string;
  readonly definition: string;
}

export const GATEWAY_PROVIDER_IDS: ReadonlySet<string> = new Set([
  'open_router',
  'vercel_gateway',
  'workers_ai',
  'nvidia_nim',
]);

type AllowListTier = Parameters<typeof getAllowedModelsForTier>[0];

const modelEntries = Object.values(modelsCatalog.models);
const byokProviderIds: ReadonlySet<string> = new Set(BYOK_PROVIDER_IDS);

const byokEntries = modelEntries.filter((model) => byokProviderIds.has(model.provider));
const gatewayEntries = byokEntries.filter((model) => GATEWAY_PROVIDER_IDS.has(model.provider));
const directEntries = byokEntries.filter((model) => !GATEWAY_PROVIDER_IDS.has(model.provider));
const keyedProvidersWithoutModels = BYOK_PROVIDER_IDS.filter(
  (id) => !byokEntries.some((model) => model.provider === id),
);
const cliLocalRuntimeIds: ReadonlySet<string> = new Set(CLI_LOCAL_RUNTIME_IDS);
const providerRecordIds = Object.keys(modelsCatalog.providers);
const localRuntimeRecordIds = Object.entries(modelsCatalog.providers)
  .filter(([, record]) => LOCAL_RUNTIME_LABEL_SUFFIX.test(record.label))
  .map(([id]) => id);
const localRuntimeRecordIdSet: ReadonlySet<string> = new Set(localRuntimeRecordIds);

export const PROVIDER_RECORD_SPLIT = Object.freeze({
  onByokList: providerRecordIds.filter((id) => byokProviderIds.has(id)).length,
  localRuntime: localRuntimeRecordIds.length,
  localRuntimeUsedByCli: localRuntimeRecordIds.filter((id) => cliLocalRuntimeIds.has(id)).length,
  other: providerRecordIds.filter(
    (id) => !byokProviderIds.has(id) && !localRuntimeRecordIdSet.has(id),
  ).length,
});

const managedRoster = new Set(
  (Object.keys(modelsCatalog.tierAllowedModels) as AllowListTier[]).flatMap((tier) =>
    getAllowedModelsForTier(tier),
  ),
);

function scope(value: number, label: string, definition: string): CatalogScope {
  return Object.freeze({ value, label, text: `${value} ${label}`, definition });
}

export const CATALOG_SCOPES = Object.freeze({
  asOf: CATALOG_AS_OF,
  catalogueEntries: scope(
    modelEntries.length,
    'catalogue entries',
    'Every model record in the shared catalogue, whichever provider lists it. This is the widest figure, and it is the catalogue the apps compile in, not a list of models an account can use.',
  ),
  byokModelEntries: scope(
    byokEntries.length,
    'BYOK model entries',
    `The catalogue entries listed under the ${BYOK_PROVIDER_IDS.length} providers on the bring-your-own-key list. It is the gateway entries plus the direct entries, and it leaves out the ${modelEntries.length - byokEntries.length} entries listed under providers that are not on that list.`,
  ),
  gatewayEntries: scope(
    gatewayEntries.length,
    'gateway entries',
    'Entries a gateway lists on behalf of other developers, reached with your gateway key. The same model can also appear under its own developer, so this is a count of routes, not of distinct models.',
  ),
  directModelEntries: scope(
    directEntries.length,
    'direct model entries',
    "Entries listed under a provider you reach with that provider's own key, with no gateway in between.",
  ),
  byokProviders: scope(
    BYOK_PROVIDER_IDS.length,
    'BYOK providers',
    `Providers on the bring-your-own-key list. ${keyedProvidersWithoutModels.length} of them list no models in the catalogue, so they add to the provider count and not to the model count.`,
  ),
  byokProvidersWithoutModels: scope(
    keyedProvidersWithoutModels.length,
    'providers with no listed models',
    'Providers that take your key but carry no catalogued models, so they add to the provider count and not to the model count.',
  ),
  localRuntimes: scope(
    CLI_LOCAL_RUNTIME_IDS.length,
    'local runtimes',
    'Runtimes the CLI discovers on your own machine. They carry no catalogued models, because the server you started reports what it holds.',
  ),
  providerRecords: scope(
    providerRecordIds.length,
    'provider records',
    `Every provider record in the catalogue. ${PROVIDER_RECORD_SPLIT.onByokList} are on the bring-your-own-key list, ${PROVIDER_RECORD_SPLIT.localRuntime} are local runtime records, of which the CLI uses ${PROVIDER_RECORD_SPLIT.localRuntimeUsedByCli}, and ${PROVIDER_RECORD_SPLIT.other} are records for the managed router, media models and providers that are not on the bring-your-own-key list. It is a bookkeeping count, not a number of integrations you can configure.`,
  ),
  managedRosterModels: scope(
    managedRoster.size,
    'managed roster models',
    'The models the plan allow lists name for AGI managed cloud, which is the only route AGI Web uses. Which of them a plan includes is shown on the pricing page.',
  ),
});

export type CatalogScopeId = Exclude<keyof typeof CATALOG_SCOPES, 'asOf'>;

export const CATALOG_SCOPE_ORDER: readonly CatalogScopeId[] = Object.freeze([
  'catalogueEntries',
  'byokModelEntries',
  'gatewayEntries',
  'directModelEntries',
  'byokProviders',
  'byokProvidersWithoutModels',
  'localRuntimes',
  'providerRecords',
  'managedRosterModels',
]);
