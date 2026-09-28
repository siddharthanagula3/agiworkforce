import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import {
  isPluginMarketplaceContentHash,
  PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD,
} from '@agiworkforce/cloud-contracts';

import { PayloadCeilingExceededError } from '@/lib/payload-ceiling';
import { refuseUnsafeUpload } from '@/lib/security/upload-scan';
import {
  PluginArchiveError,
  readPluginArchive,
  readSkillArchiveAsPlugin,
  type UploadedPluginArchive,
} from './archive';
import {
  PLUGIN_UPLOAD_FILE_FIELD,
  PLUGIN_UPLOAD_NAME_FIELD,
  UPLOAD_NOT_AN_ARCHIVE_MESSAGE,
} from './constants';

const ARCHIVE_EXTENSION = /\.zip$/i;
const DEFAULT_ARCHIVE_NAME = 'upload';
const PLUGIN_ARCHIVE_MIME = 'application/zip';
const INVALID_UPLOAD_CODE = 'PLUGIN_UPLOAD_INVALID';
const REJECTED_UPLOAD_CODE = 'PLUGIN_UPLOAD_REJECTED';

export interface ArchiveUpload {
  archive: UploadedPluginArchive;
  name: string | null;
  acknowledgedScans: string[];
  singleSkill: boolean;
}

export interface ArchiveUploadOptions {
  acceptSingleSkill?: boolean;
}

function fallbackName(fileName: string, provided: string | null): string {
  const chosen = provided?.trim();
  if (chosen && chosen.length > 0) return chosen;
  const base = fileName.replace(ARCHIVE_EXTENSION, '').trim();
  return base.length > 0 ? base : DEFAULT_ARCHIVE_NAME;
}

export function invalidUploadResponse(message: string): NextResponse {
  return NextResponse.json({ error: { code: INVALID_UPLOAD_CODE, message } }, { status: 400 });
}

export function rejectedUploadResponse(message: string, issues?: readonly string[]): NextResponse {
  return NextResponse.json(
    { error: { code: REJECTED_UPLOAD_CODE, message, ...(issues ? { issues } : {}) } },
    { status: 422 },
  );
}

async function readArchive(
  bytes: Uint8Array,
  fallback: string,
  options: ArchiveUploadOptions,
): Promise<{ archive: UploadedPluginArchive; singleSkill: boolean }> {
  try {
    return { archive: await readPluginArchive(bytes, fallback), singleSkill: false };
  } catch (error) {
    if (!(error instanceof PluginArchiveError) || !options.acceptSingleSkill) throw error;
    try {
      return { archive: await readSkillArchiveAsPlugin(bytes), singleSkill: true };
    } catch {
      throw error;
    }
  }
}

export async function readArchiveUpload(
  request: NextRequest,
  options: ArchiveUploadOptions = {},
): Promise<ArchiveUpload | NextResponse> {
  let form: FormData;
  try {
    form = (await request.formData()) as unknown as FormData;
  } catch (error) {
    if (error instanceof PayloadCeilingExceededError) throw error;
    return invalidUploadResponse(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  }
  const file = form.get(PLUGIN_UPLOAD_FILE_FIELD);
  if (!file || typeof file === 'string')
    return invalidUploadResponse(UPLOAD_NOT_AN_ARCHIVE_MESSAGE);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = 'name' in file && typeof file.name === 'string' ? file.name : '';
  await refuseUnsafeUpload(bytes, PLUGIN_ARCHIVE_MIME, {
    leadsObject: true,
    filename: fileName || undefined,
  });
  const provided = form.get(PLUGIN_UPLOAD_NAME_FIELD);
  const name = typeof provided === 'string' ? provided : null;
  try {
    const read = await readArchive(bytes, fallbackName(fileName, name), options);
    return {
      ...read,
      name: name?.trim() || null,
      acknowledgedScans: form
        .getAll(PLUGIN_UPLOAD_ACKNOWLEDGED_SCAN_FIELD)
        .filter((value): value is string => isPluginMarketplaceContentHash(value)),
    };
  } catch (error) {
    if (error instanceof PluginArchiveError) {
      return rejectedUploadResponse(error.message, error.issues);
    }
    throw error;
  }
}
