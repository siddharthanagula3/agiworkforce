import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import {
  resolveAutoRoute,
  type AutoRoutingRequest,
  type SelectedAutoRoute,
} from '@agiworkforce/routing';

export function requireCatalogModel(
  predicate: (model: ModelMetadata) => boolean,
  requiredBehavior: string,
): ModelMetadata {
  const model = listCanonicalModels().find(predicate);
  if (!model) {
    throw new Error(`The model catalog must expose ${requiredBehavior}`);
  }
  return model;
}

export function requireSelectedCatalogRoute(
  request: AutoRoutingRequest,
  requiredBehavior: string,
): SelectedAutoRoute {
  const decision = resolveAutoRoute(request);
  if (decision.status !== 'selected') {
    throw new Error(
      `The model catalog must expose ${requiredBehavior}: ${decision.reasons.join('; ')}`,
    );
  }
  return decision;
}

export function requireRoutableCatalogModel(
  predicate: (model: ModelMetadata) => boolean,
  route: Omit<AutoRoutingRequest, 'selection'>,
  requiredBehavior: string,
): ModelMetadata {
  return requireCatalogModel((model) => {
    if (!predicate(model)) return false;
    const decision = resolveAutoRoute({ ...route, selection: model.id });
    return decision.status === 'selected' && decision.modelKey === model.id;
  }, requiredBehavior);
}
