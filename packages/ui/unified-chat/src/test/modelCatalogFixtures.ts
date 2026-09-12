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

export interface RoutedCatalogModel {
  model: ModelMetadata;
  route: SelectedAutoRoute;
}

export function requireRoutedCatalogModel(
  predicate: (model: ModelMetadata, route: SelectedAutoRoute) => boolean,
  route: Omit<AutoRoutingRequest, 'selection'>,
  requiredBehavior: string,
): RoutedCatalogModel {
  for (const model of listCanonicalModels()) {
    const decision = resolveAutoRoute({ ...route, selection: model.id });
    if (decision.status !== 'selected' || decision.modelKey !== model.id) continue;
    if (!predicate(model, decision)) continue;
    return { model, route: decision };
  }
  throw new Error(`The model catalog must expose ${requiredBehavior}`);
}

export function requireRoutableCatalogModel(
  predicate: (model: ModelMetadata) => boolean,
  route: Omit<AutoRoutingRequest, 'selection'>,
  requiredBehavior: string,
): ModelMetadata {
  return requireRoutedCatalogModel((model) => predicate(model), route, requiredBehavior).model;
}
