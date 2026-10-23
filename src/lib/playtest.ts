import { zipSync } from 'fflate';
import { generateModelsManifest } from '../core/modelsManifest';
import type { Project } from '../core/types';
import { storage } from '../storage/db';

/** Bundled OpenBOR WebAssembly loader, served from `public/openbor-wasm`. */
export const PLAYTEST_LOADER_PATH = `${import.meta.env.BASE_URL}openbor-wasm/game.html`;

/**
 * Cache the game tab reads the project zip from. The loader deletes each entry once it has taken
 * the zip, so the cache only holds data between Play and the game tab starting.
 */
export const PLAYTEST_CACHE = 'openbor-playtest';

/**
 * Map an imported virtual path (for example `mygame/data/chars/angel/duck1.gif`) to the path the
 * engine reads from its game root (`data/chars/angel/duck1.gif`). Paths without a `data` folder
 * are placed under `data/`.
 */
export function enginePathFor(virtualPath: string): string {
  const segments = virtualPath
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.');
  const dataIndex = segments.findIndex((segment) => segment.toLowerCase() === 'data');
  if (dataIndex >= 0) return segments.slice(dataIndex).join('/');
  return `data/${segments.join('/')}`;
}

const ENGINE_FILE_PATTERN = /\.(txt|gif|png|bmp|pcx|wav|ogg|mp3|mod|it|xm|s3m)$/i;

/**
 * Model and level files name other files with the casing the author used, and the engine opens
 * those names exactly. When a referenced name differs only by case from a stored file, write a copy
 * under the referenced name as well.
 */
function addReferencedNameCopies(files: Record<string, Uint8Array>, texts: string[]): void {
  for (const text of texts) {
    for (const token of text.split(/[\s"]+/)) {
      const name = token.replace(/\\/g, '/').replace(/^\.\//, '').replace(/[,;]+$/, '');
      if (!name.includes('/') && !ENGINE_FILE_PATTERN.test(name)) continue;
      const lower = name.toLowerCase();
      if (name !== lower && files[lower] && !files[name]) files[name] = files[lower];
    }
  }
}

/** Build the game zip the engine loads: text models, models.txt, and every imported asset. */
export async function buildProjectZip(
  project: Project,
  unsavedText: Record<string, string> = {},
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const texts: string[] = [];

  for (const entity of project.entities) {
    const raw = unsavedText[entity.id] ?? entity.raw;
    files[enginePathFor(entity.path)] = encoder.encode(raw);
    texts.push(raw);
  }

  const modelsText = project.modelsFile ?? generateModelsManifest(project.entities);
  files['data/models.txt'] = encoder.encode(modelsText);
  texts.push(modelsText);

  const assets = await storage.listAssets(project.id);
  for (const asset of assets) {
    const target = enginePathFor(asset.path);
    if (files[target]) continue;
    files[target] = new Uint8Array(await asset.blob.arrayBuffer());
  }

  // Native OpenBOR ignores case on Windows, but the browser file system does not. Add a lowercase
  // copy of each path so references written in lowercase (such as data/levels.txt) still resolve.
  for (const path of Object.keys(files)) {
    const lower = path.toLowerCase();
    if (lower !== path && !files[lower]) files[lower] = files[path];
  }
  addReferencedNameCopies(files, texts);

  // The engine's loader only creates folders from explicit directory entries (names ending in /),
  // so every parent folder of a file needs one or the file cannot be written.
  const folders = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) folders.add(`${parts.slice(0, depth).join('/')}/`);
  }
  for (const folder of folders) files[folder] = new Uint8Array(0);

  // Images and sounds are already compressed, so storing entries skips a slow pass in both the
  // workbench and the engine's unzip step.
  return zipSync(files, { level: 0 });
}

/**
 * Zip the project and open it in a new tab running the real OpenBOR engine. The zip is handed over
 * through the same-origin Cache API under a one-time key, so the game tab does not depend on this
 * page staying open. Nothing leaves the browser.
 */
export async function playProjectInBrowser(
  project: Project,
  unsavedText: Record<string, string> = {},
): Promise<void> {
  const bytes = await buildProjectZip(project, unsavedText);
  const key = `/openbor-playtest/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.zip`;
  const cache = await caches.open(PLAYTEST_CACHE);
  // Drop zips left behind by earlier Play clicks that never reached the game tab.
  for (const stale of await cache.keys()) await cache.delete(stale);
  await cache.put(key, new Response(new Blob([bytes.slice()], { type: 'application/zip' })));
  // window.open can return null even when the tab opens, so the entry is left for the game tab to take.
  window.open(`${PLAYTEST_LOADER_PATH}?${new URLSearchParams({ playtest: key, title: project.name })}`, '_blank');
}
