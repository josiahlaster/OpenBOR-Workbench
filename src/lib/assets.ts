import { useEffect, useState } from 'react';
import { normalizeAssetPath } from '../core/modelsManifest';
import { storage } from '../storage/db';

/** Normalized asset path (lowercase, forward slashes) → object URL for the image. */
export type AssetUrlIndex = Map<string, string>;

const indexCache = new Map<string, Promise<AssetUrlIndex>>();
const spriteCache = new Map<string, Promise<HTMLCanvasElement>>();

export function loadProjectAssetUrls(projectId: string): Promise<AssetUrlIndex> {
  let pending = indexCache.get(projectId);
  if (!pending) {
    pending = storage.listAssets(projectId).then((records) => {
      const index: AssetUrlIndex = new Map();
      for (const record of records) {
        index.set(normalizeAssetPath(record.path), URL.createObjectURL(record.blob));
      }
      return index;
    });
    indexCache.set(projectId, pending);
  }
  return pending;
}

/** Call after assets change so the next read reflects the stored images. */
export function forgetProjectAssets(projectId: string): void {
  const pending = indexCache.get(projectId);
  indexCache.delete(projectId);
  pending
    ?.then((index) => index.forEach((url) => URL.revokeObjectURL(url)))
    .catch(() => undefined);
}

/**
 * Resolve an OpenBOR frame path (for example `data/chars/angel/duck1.gif`) against imported
 * files. Imports can sit under any parent folder, so a suffix match is used when the exact
 * path is not present.
 */
export function resolveAssetUrl(index: AssetUrlIndex, path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = normalizeAssetPath(path);
  const exact = index.get(normalized);
  if (exact) return exact;
  for (const [key, url] of index) {
    if (key.endsWith(`/${normalized}`)) return url;
  }
  return null;
}

export function useProjectAssets(projectId: string | null | undefined): AssetUrlIndex | null {
  const [index, setIndex] = useState<AssetUrlIndex | null>(null);
  useEffect(() => {
    setIndex(null);
    if (!projectId) return undefined;
    let active = true;
    loadProjectAssetUrls(projectId)
      .then((value) => {
        if (active) setIndex(value);
      })
      .catch(() => {
        if (active) setIndex(new Map());
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  return index;
}

/**
 * Load an OpenBOR sprite. Pure magenta (255, 0, 255) is the engine's transparent colour, so it
 * is keyed out here to match how the game draws the sprite.
 */
export function loadKeyedSprite(url: string): Promise<HTMLCanvasElement> {
  let pending = spriteCache.get(url);
  if (!pending) {
    pending = new Promise<HTMLCanvasElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          reject(new Error('Canvas is not available.'));
          return;
        }
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) data[i + 3] = 0;
        }
        context.putImageData(pixels, 0, 0);
        resolve(canvas);
      };
      image.onerror = () => reject(new Error('The sprite image could not be decoded.'));
      image.src = url;
    });
    spriteCache.set(url, pending);
  }
  return pending;
}
