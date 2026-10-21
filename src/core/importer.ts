import { isLevelModel, parseModel } from './parser';
import { buildSummary } from './summary';
import type { ProjectEntity } from './types';

export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_IMPORT_BYTES = 1024 * 1024 * 1024;
export const MAX_IMPORT_FILES = 20000;
export const MAX_ASSET_PATHS = 20000;

export interface FileInput {
  name: string;
  path?: string;
  size: number;
  text?: string;
  /** Binary asset content (images, audio). Stored in IndexedDB on import. */
  blob?: Blob;
}

export interface ImportedAsset {
  path: string;
  blob: Blob;
}

export interface ImportMessage {
  fileName: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportResult {
  entities: ProjectEntity[];
  modelsFile: string | null;
  modelsFileName: string;
  assetPaths: string[];
  assetBlobs: ImportedAsset[];
  errors: ImportMessage[];
  warnings: ImportMessage[];
  skipped: number;
}

const ASSET_EXTENSIONS = new Set([
  'png',
  'gif',
  'jpg',
  'jpeg',
  'bmp',
  'pcx',
  'wav',
  'ogg',
  'mp3',
  'mod',
  'it',
  'xm',
  's3m',
  'c',
  'h',
  'js',
  'bor',
]);

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeVirtualPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\.\.(\/|$)/g, '');
}

export function safeFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? 'model.txt';
  return base.replace(/[<>:"|?*\u0000-\u001F]/g, '_');
}

function slugName(name: string): string {
  return name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
}

export function inferPath(fileName: string, name: string | null): string {
  return `data/chars/${slugName(name ?? fileName.replace(/\.txt$/i, ''))}/${safeFileName(fileName)}`;
}

export function isManifestFile(file: FileInput): boolean {
  const base = safeFileName(file.name).toLowerCase();
  return base === 'models.txt' || base === 'models.txt ';
}

export function isLevelFile(text: string): boolean {
  return isLevelModel(parseModel(text));
}

export function importFiles(files: FileInput[], now = Date.now()): ImportResult {
  const result: ImportResult = {
    entities: [],
    modelsFile: null,
    modelsFileName: 'models.txt',
    assetPaths: [],
    assetBlobs: [],
    errors: [],
    warnings: [],
    skipped: 0,
  };
  let total = 0;
  let textCount = 0;
  const seenPaths = new Set<string>();
  const assetPaths = new Set<string>();

  for (const file of files.slice(0, MAX_IMPORT_FILES)) {
    const virtualPath = normalizeVirtualPath(file.path || file.name);
    total += file.size;
    if (total > MAX_TOTAL_IMPORT_BYTES) {
      result.errors.push({
        fileName: file.name,
        severity: 'error',
        message: `Import stopped because the selection exceeds the ${Math.round(MAX_TOTAL_IMPORT_BYTES / 1024 / 1024)} MB total limit.`,
      });
      result.skipped += 1;
      break;
    }

    const lower = file.name.toLowerCase();
    const extension = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
    if (isManifestFile(file)) {
      if (typeof file.text !== 'string') {
        result.errors.push({
          fileName: file.name,
          severity: 'error',
          message: 'models.txt could not be read as text.',
        });
        continue;
      }
      result.modelsFile = file.text.replace(/^\uFEFF/, '');
      result.modelsFileName = safeFileName(file.name);
      assetPaths.add(virtualPath);
      continue;
    }
    if (extension !== 'txt') {
      if (ASSET_EXTENSIONS.has(extension) || extension === '') assetPaths.add(virtualPath);
      if (file.blob && ASSET_EXTENSIONS.has(extension)) {
        result.assetBlobs.push({ path: virtualPath, blob: file.blob });
      }
      continue;
    }
    if (file.size > MAX_TEXT_FILE_BYTES) {
      result.errors.push({
        fileName: file.name,
        severity: 'error',
        message: `File is larger than the ${Math.round(MAX_TEXT_FILE_BYTES / 1024 / 1024)} MB text-file limit.`,
      });
      result.skipped += 1;
      continue;
    }
    if (typeof file.text !== 'string') {
      result.errors.push({
        fileName: file.name,
        severity: 'error',
        message: 'The text file could not be decoded.',
      });
      continue;
    }
    textCount += 1;
    const text = file.text.replace(/^\uFEFF/, '');
    let parsed: ReturnType<typeof parseModel>;
    try {
      parsed = parseModel(text);
    } catch (error) {
      result.errors.push({
        fileName: file.name,
        severity: 'error',
        message: `Could not parse this file: ${error instanceof Error ? error.message : String(error)}`,
      });
      result.skipped += 1;
      continue;
    }
    const level = isLevelModel(parsed);
    if (!level && !parsed.name && parsed.animations.length === 0) {
      result.errors.push({
        fileName: file.name,
        severity: 'error',
        message:
          'This does not look like an OpenBOR model or level. A model needs a "name" header and animation blocks.',
      });
      result.skipped += 1;
      continue;
    }
    if (!level && !parsed.name) {
      result.warnings.push({
        fileName: file.name,
        severity: 'warning',
        message: 'Imported without a name header. The validation page explains how to fix it.',
      });
    }
    const path = virtualPath || inferPath(file.name, parsed.name);
    const key = path.toLowerCase();
    if (seenPaths.has(key)) {
      result.warnings.push({
        fileName: file.name,
        severity: 'warning',
        message: `A file with the path "${path}" was already imported; this copy was skipped.`,
      });
      result.skipped += 1;
      continue;
    }
    seenPaths.add(key);
    assetPaths.add(path);
    const summary = buildSummary(text);
    result.entities.push({
      id: newId(),
      fileName: safeFileName(file.name),
      path,
      raw: text,
      savedRaw: text,
      createdAt: now,
      updatedAt: now,
      summary,
      revisions: [],
    });
  }

  if (files.length > MAX_IMPORT_FILES) {
    result.warnings.push({
      fileName: '',
      severity: 'warning',
      message: `Only the first ${MAX_IMPORT_FILES} files were considered.`,
    });
  }
  if (result.entities.length === 0 && result.errors.length === 0 && textCount > 0) {
    result.errors.push({
      fileName: '',
      severity: 'error',
      message: 'No model files were imported.',
    });
  }
  result.assetPaths = [...assetPaths].slice(0, MAX_ASSET_PATHS);
  return result;
}

export async function readFilesFromList(fileList: FileList | File[]): Promise<FileInput[]> {
  const files = Array.from(fileList);
  const result: FileInput[] = [];
  for (const file of files) {
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    const isText = extension === 'txt';
    result.push({
      name: file.name,
      path:
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        normalizeVirtualPath(file.name),
      size: file.size,
      text: isText ? await file.text() : undefined,
      blob: isText ? undefined : file,
    });
  }
  return result;
}

export function acceptedFileTypes(): string {
  return '.txt,.png,.gif,.jpg,.jpeg,.bmp,.wav,.ogg,.mp3,.mod,.it,.xm,.s3m,.c,.h,.js,.bor';
}
