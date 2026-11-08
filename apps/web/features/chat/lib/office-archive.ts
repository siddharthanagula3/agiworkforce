import JSZip from 'jszip';
import {
  MAX_OFFICE_UNCOMPRESSED_BYTES,
  decompressionBudget,
  type DecompressionBudget,
} from '@/lib/security/archive-budget';

export interface OfficeArchive {
  zip: JSZip;
  budget: DecompressionBudget;
}

export async function openOfficeArchive(data: ArrayBuffer): Promise<OfficeArchive> {
  const zip = await JSZip.loadAsync(data);
  const budget = decompressionBudget(data.byteLength, MAX_OFFICE_UNCOMPRESSED_BYTES);
  budget.admitMembers(Object.values(zip.files).filter((entry) => !entry.dir).length);
  return { zip, budget };
}

type StreamingMember = JSZip.JSZipObject & {
  internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
};

type OfficeMemberBytes<Limit extends number | undefined> = Limit extends number
  ? Uint8Array | null
  : Uint8Array;

export function readOfficeMember<Limit extends number | undefined = undefined>(
  entry: JSZip.JSZipObject,
  budget: DecompressionBudget,
  maxMemberBytes?: Limit,
): Promise<OfficeMemberBytes<Limit>> {
  return new Promise<OfficeMemberBytes<Limit>>((resolve, reject) => {
    const stream = (entry as StreamingMember).internalStream('uint8array');
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      chunks.length = 0;
      reject(error);
    };
    stream.on('data', (chunk) => {
      if (settled) return;
      try {
        budget.spend(chunk.byteLength);
        total += chunk.byteLength;
        if (maxMemberBytes !== undefined && total > maxMemberBytes) {
          settled = true;
          stream.pause();
          chunks.length = 0;
          resolve(null as OfficeMemberBytes<Limit>);
          return;
        }
        chunks.push(chunk);
      } catch (error) {
        fail(error);
      }
    });
    stream.on('error', fail);
    stream.on('end', () => {
      if (settled) return;
      try {
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        chunks.length = 0;
        settled = true;
        resolve(bytes as OfficeMemberBytes<Limit>);
      } catch (error) {
        fail(error);
      }
    });
    stream.resume();
  });
}

export async function officeMemberText(
  archive: OfficeArchive,
  path: string,
): Promise<string | undefined> {
  const entry = archive.zip.file(path);
  if (!entry) return undefined;
  const bytes = await readOfficeMember(entry, archive.budget);
  return new TextDecoder().decode(bytes);
}

export async function storedOfficeArchive(data: ArrayBuffer): Promise<ArrayBuffer> {
  const archive = await openOfficeArchive(data);
  const accepted = new JSZip();
  const comment =
    'comment' in archive.zip && typeof archive.zip.comment === 'string'
      ? archive.zip.comment
      : undefined;
  for (const entry of Object.values(archive.zip.files)) {
    const bytes = entry.dir ? new Uint8Array() : await readOfficeMember(entry, archive.budget);
    accepted.file(entry.name, bytes, {
      dir: entry.dir,
      date: entry.date,
      comment: entry.comment,
      unixPermissions: entry.unixPermissions,
      dosPermissions: entry.dosPermissions,
      createFolders: false,
      compression: 'STORE',
    });
  }
  return accepted.generateAsync({ type: 'arraybuffer', compression: 'STORE', comment });
}
