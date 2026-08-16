import 'server-only';

export const SCIM_CONTENT_TYPE = 'application/scim+json';

export const SCIM_SCHEMA = {
  user: 'urn:ietf:params:scim:schemas:core:2.0:User',
  group: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  serviceProviderConfig: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  resourceType: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
  schema: 'urn:ietf:params:scim:schemas:core:2.0:Schema',
  listResponse: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  error: 'urn:ietf:params:scim:api:messages:2.0:Error',
  patchOp: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
} as const;

export type ScimErrorType =
  | 'invalidFilter'
  | 'tooMany'
  | 'uniqueness'
  | 'mutability'
  | 'invalidSyntax'
  | 'invalidPath'
  | 'noTarget'
  | 'invalidValue'
  | 'invalidVers'
  | 'sensitive';

export interface ScimErrorBody {
  schemas: [typeof SCIM_SCHEMA.error];
  status: string;
  scimType?: ScimErrorType;
  detail: string;
}

export function scimErrorBody(
  status: number,
  detail: string,
  scimType?: ScimErrorType,
): ScimErrorBody {
  return {
    schemas: [SCIM_SCHEMA.error],
    status: String(status),
    ...(scimType ? { scimType } : {}),
    detail,
  };
}

export function scimResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', SCIM_CONTENT_TYPE);
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

export function scimError(status: number, detail: string, scimType?: ScimErrorType): Response {
  const headers = new Headers();
  if (status === 401) {
    headers.set('www-authenticate', 'Bearer realm="scim"');
  }
  return scimResponse(scimErrorBody(status, detail, scimType), status, headers);
}

export class ScimError extends Error {
  readonly status: number;
  readonly scimType: ScimErrorType | undefined;

  constructor(status: number, detail: string, scimType?: ScimErrorType) {
    super(detail);
    this.name = 'ScimError';
    this.status = status;
    this.scimType = scimType;
  }

  toResponse(): Response {
    return scimError(this.status, this.message, this.scimType);
  }
}

export const SCIM_MAX_PAGE_SIZE = 200;
export const SCIM_DEFAULT_PAGE_SIZE = 100;

export interface ScimPagination {
  startIndex: number;
  count: number;
  offset: number;
}

export function parseScimPagination(params: URLSearchParams): ScimPagination {
  const rawStart = params.get('startIndex');
  const rawCount = params.get('count');

  let startIndex = 1;
  if (rawStart !== null && rawStart.trim() !== '') {
    const parsed = Number(rawStart);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new ScimError(400, 'startIndex must be an integer', 'invalidValue');
    }
    startIndex = parsed < 1 ? 1 : parsed;
  }

  let count = SCIM_DEFAULT_PAGE_SIZE;
  if (rawCount !== null && rawCount.trim() !== '') {
    const parsed = Number(rawCount);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new ScimError(400, 'count must be an integer', 'invalidValue');
    }
    count = parsed < 0 ? 0 : Math.min(parsed, SCIM_MAX_PAGE_SIZE);
  }

  return { startIndex, count, offset: startIndex - 1 };
}

export interface ScimListResponse<T> {
  schemas: [typeof SCIM_SCHEMA.listResponse];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export function scimListResponse<T>(
  resources: T[],
  totalResults: number,
  pagination: ScimPagination,
): ScimListResponse<T> {
  return {
    schemas: [SCIM_SCHEMA.listResponse],
    totalResults,
    startIndex: pagination.startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

export const SCIM_USER_FILTER_ATTRIBUTES = ['userName', 'externalId', 'emails.value'] as const;
export const SCIM_GROUP_FILTER_ATTRIBUTES = ['displayName', 'externalId'] as const;

export type ScimUserFilterAttribute = (typeof SCIM_USER_FILTER_ATTRIBUTES)[number];
export type ScimGroupFilterAttribute = (typeof SCIM_GROUP_FILTER_ATTRIBUTES)[number];

export interface ScimFilter<A extends string> {
  attribute: A;
  operator: 'eq';
  value: string;
}

const FILTER_PATTERN =
  /^\s*([A-Za-z][A-Za-z0-9._-]{0,63})\s+([A-Za-z]{2})\s+"((?:[^"\\]|\\.)*)"\s*$/u;

const MAX_FILTER_LENGTH = 512;
const MAX_FILTER_VALUE_LENGTH = 320;

function unescapeFilterValue(raw: string): string {
  return raw.replace(/\\(["\\/bfnrt])/gu, (_match, char: string) => {
    switch (char) {
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return char;
    }
  });
}

function parseFilter<A extends string>(
  raw: string | null,
  allowed: readonly A[],
): ScimFilter<A> | null {
  if (raw === null || raw.trim() === '') return null;

  if (raw.length > MAX_FILTER_LENGTH) {
    throw new ScimError(400, 'Filter exceeds the supported length', 'invalidFilter');
  }

  const match = FILTER_PATTERN.exec(raw);
  if (!match) {
    throw new ScimError(
      400,
      'Only a single `attribute eq "value"` filter is supported',
      'invalidFilter',
    );
  }

  const [, attribute, operator, quoted] = match as unknown as [string, string, string, string];

  if (operator.toLowerCase() !== 'eq') {
    throw new ScimError(400, `Filter operator "${operator}" is not supported`, 'invalidFilter');
  }

  const allowedAttribute = allowed.find(
    (candidate) => candidate.toLowerCase() === attribute.toLowerCase(),
  );
  if (!allowedAttribute) {
    throw new ScimError(
      400,
      `Filtering on "${attribute}" is not supported; supported attributes: ${allowed.join(', ')}`,
      'invalidFilter',
    );
  }

  const value = unescapeFilterValue(quoted);
  if (value.length > MAX_FILTER_VALUE_LENGTH) {
    throw new ScimError(400, 'Filter value exceeds the supported length', 'invalidFilter');
  }

  return { attribute: allowedAttribute, operator: 'eq', value };
}

export function parseScimUserFilter(
  raw: string | null,
): ScimFilter<ScimUserFilterAttribute> | null {
  return parseFilter(raw, SCIM_USER_FILTER_ATTRIBUTES);
}

export function parseScimGroupFilter(
  raw: string | null,
): ScimFilter<ScimGroupFilterAttribute> | null {
  return parseFilter(raw, SCIM_GROUP_FILTER_ATTRIBUTES);
}

export type ScimPatchOperationName = 'add' | 'remove' | 'replace';

export interface ScimPatchOperation {
  op: ScimPatchOperationName;
  path?: string;
  value?: unknown;
}

const MAX_PATCH_OPERATIONS = 100;

export function parseScimPatch(body: unknown): ScimPatchOperation[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ScimError(400, 'PATCH body must be a JSON object', 'invalidSyntax');
  }

  const record = body as Record<string, unknown>;
  const schemas = record['schemas'];

  if (
    !Array.isArray(schemas) ||
    !schemas.some((entry) => typeof entry === 'string' && entry === SCIM_SCHEMA.patchOp)
  ) {
    throw new ScimError(400, `PATCH body must declare ${SCIM_SCHEMA.patchOp}`, 'invalidSyntax');
  }

  const operations = record['Operations'] ?? record['operations'];
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new ScimError(
      400,
      'PATCH body must contain a non-empty Operations array',
      'invalidSyntax',
    );
  }

  if (operations.length > MAX_PATCH_OPERATIONS) {
    throw new ScimError(
      400,
      `PATCH supports at most ${MAX_PATCH_OPERATIONS} operations per request`,
      'tooMany',
    );
  }

  return operations.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new ScimError(400, 'Each PATCH operation must be an object', 'invalidSyntax');
    }
    const operation = entry as Record<string, unknown>;
    const rawOp = operation['op'];
    if (typeof rawOp !== 'string') {
      throw new ScimError(400, 'Each PATCH operation requires an `op`', 'invalidSyntax');
    }
    const op = rawOp.toLowerCase();
    if (op !== 'add' && op !== 'remove' && op !== 'replace') {
      throw new ScimError(400, `Unsupported PATCH op "${rawOp}"`, 'invalidSyntax');
    }

    const rawPath = operation['path'];
    if (rawPath !== undefined && typeof rawPath !== 'string') {
      throw new ScimError(400, 'PATCH `path` must be a string', 'invalidPath');
    }
    if (typeof rawPath === 'string' && rawPath.length > 255) {
      throw new ScimError(400, 'PATCH `path` exceeds the supported length', 'invalidPath');
    }

    return {
      op,
      ...(typeof rawPath === 'string' ? { path: rawPath } : {}),
      ...('value' in operation ? { value: operation['value'] } : {}),
    } satisfies ScimPatchOperation;
  });
}

export function coerceScimBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw new ScimError(400, `\`${field}\` must be a boolean`, 'invalidValue');
}

export function scimServiceProviderConfig(baseUrl: string) {
  return {
    schemas: [SCIM_SCHEMA.serviceProviderConfig],
    documentationUri: 'https://agiworkforce.com/docs/enterprise/directory-sync',
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: SCIM_MAX_PAGE_SIZE },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication via a SCIM bearer token minted in the AGI admin console.',
        specUri: 'https://www.rfc-editor.org/rfc/rfc6750',
        primary: true,
      },
    ],
    meta: {
      location: `${baseUrl}/ServiceProviderConfig`,
      resourceType: 'ServiceProviderConfig',
    },
  };
}

export function scimResourceTypes(baseUrl: string) {
  const resources = [
    {
      schemas: [SCIM_SCHEMA.resourceType],
      id: 'User',
      name: 'User',
      endpoint: '/Users',
      description: 'SCIM 2.0 User',
      schema: SCIM_SCHEMA.user,
      meta: { location: `${baseUrl}/ResourceTypes/User`, resourceType: 'ResourceType' },
    },
    {
      schemas: [SCIM_SCHEMA.resourceType],
      id: 'Group',
      name: 'Group',
      endpoint: '/Groups',
      description: 'SCIM 2.0 Group',
      schema: SCIM_SCHEMA.group,
      meta: { location: `${baseUrl}/ResourceTypes/Group`, resourceType: 'ResourceType' },
    },
  ];

  return {
    schemas: [SCIM_SCHEMA.listResponse],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

export function scimSchemas(baseUrl: string) {
  const resources = [
    {
      schemas: [SCIM_SCHEMA.schema],
      id: SCIM_SCHEMA.user,
      name: 'User',
      description: 'SCIM 2.0 User',
      attributes: [
        stringAttribute('userName', { required: true, uniqueness: 'server' }),
        {
          name: 'name',
          type: 'complex',
          multiValued: false,
          required: false,
          mutability: 'readWrite',
          returned: 'default',
          subAttributes: [
            stringAttribute('givenName'),
            stringAttribute('familyName'),
            stringAttribute('formatted'),
          ],
        },
        stringAttribute('displayName'),
        stringAttribute('externalId'),
        {
          name: 'emails',
          type: 'complex',
          multiValued: true,
          required: false,
          mutability: 'readWrite',
          returned: 'default',
          subAttributes: [stringAttribute('value'), booleanAttribute('primary')],
        },
        booleanAttribute('active'),
      ],
      meta: { location: `${baseUrl}/Schemas/${SCIM_SCHEMA.user}`, resourceType: 'Schema' },
    },
    {
      schemas: [SCIM_SCHEMA.schema],
      id: SCIM_SCHEMA.group,
      name: 'Group',
      description: 'SCIM 2.0 Group',
      attributes: [
        stringAttribute('displayName', { required: true, uniqueness: 'server' }),
        stringAttribute('externalId'),
        {
          name: 'members',
          type: 'complex',
          multiValued: true,
          required: false,
          mutability: 'readWrite',
          returned: 'default',
          subAttributes: [stringAttribute('value'), stringAttribute('display')],
        },
      ],
      meta: { location: `${baseUrl}/Schemas/${SCIM_SCHEMA.group}`, resourceType: 'Schema' },
    },
  ];

  return {
    schemas: [SCIM_SCHEMA.listResponse],
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

function stringAttribute(
  name: string,
  options: { required?: boolean; uniqueness?: 'none' | 'server' } = {},
) {
  return {
    name,
    type: 'string',
    multiValued: false,
    required: options.required ?? false,
    caseExact: false,
    mutability: 'readWrite',
    returned: 'default',
    uniqueness: options.uniqueness ?? 'none',
  };
}

function booleanAttribute(name: string) {
  return {
    name,
    type: 'boolean',
    multiValued: false,
    required: false,
    mutability: 'readWrite',
    returned: 'default',
  };
}
