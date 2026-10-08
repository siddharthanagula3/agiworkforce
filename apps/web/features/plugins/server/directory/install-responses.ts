import { NextResponse } from 'next/server';

import { AppError, createError } from '@/lib/errors';
import { INSTALLS_DISABLED_MESSAGE, MARKETPLACE_UNAVAILABLE_MESSAGE } from './constants';
import type { DirectoryInstallRefusal } from './install';
import type { PluginDependent } from './installed-dependents';

const INSTALLS_DISABLED_CODE = 'PLUGIN_INSTALLS_DISABLED';
const INSTALLS_DISABLED_STATUS = 503;

export function installsDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: INSTALLS_DISABLED_CODE, message: INSTALLS_DISABLED_MESSAGE } },
    { status: INSTALLS_DISABLED_STATUS },
  );
}

const PLUGIN_HAS_DEPENDENTS_CODE = 'PLUGIN_HAS_DEPENDENTS';
const PLUGIN_HAS_DEPENDENTS_STATUS = 409;

export function pluginHasDependentsResponse(
  message: string,
  dependents: readonly PluginDependent[],
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: PLUGIN_HAS_DEPENDENTS_CODE,
        message,
        dependents: dependents.map(({ id, name }) => ({ id, name })),
      },
    },
    { status: PLUGIN_HAS_DEPENDENTS_STATUS },
  );
}

const PLUGIN_NOT_PERMITTED_CODE = 'PLUGIN_NOT_PERMITTED';
const PLUGIN_NOT_PERMITTED_STATUS = 403;

export function pluginNotPermittedResponse(reason: string): NextResponse {
  return NextResponse.json(
    { error: { code: PLUGIN_NOT_PERMITTED_CODE, message: reason } },
    { status: PLUGIN_NOT_PERMITTED_STATUS },
  );
}

export function installRefusalResponse(result: DirectoryInstallRefusal): NextResponse {
  switch (result.status) {
    case 'not-permitted':
      return pluginNotPermittedResponse(result.message);
    case 'missing':
      return NextResponse.json(
        { error: { code: 'PLUGIN_NOT_FOUND', message: result.message } },
        { status: 404 },
      );
    case 'builtin':
      return NextResponse.json(
        { error: { code: 'PLUGIN_IS_BUILTIN', message: result.message } },
        { status: 409 },
      );
    case 'blocked':
      return NextResponse.json(
        {
          error: {
            code: 'PLUGIN_NOT_INSTALLABLE',
            message: result.message,
            installCommand: result.installCommand,
          },
        },
        { status: 409 },
      );
    case 'skills-unavailable':
    case 'source-unavailable':
      return NextResponse.json(
        { error: { code: 'PLUGIN_SOURCE_UNAVAILABLE', message: result.message } },
        { status: 502 },
      );
  }
}

export function marketplaceUnavailableError(): AppError {
  return createError.capabilityUnavailable(MARKETPLACE_UNAVAILABLE_MESSAGE);
}
