import { NextResponse } from 'next/server';

import type { DirectoryInstallRefusal } from './install';
import type { PluginDependent } from './installed-dependents';

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
