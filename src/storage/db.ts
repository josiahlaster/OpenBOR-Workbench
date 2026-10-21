import type { AppSettings, DraftRecord, Project } from '../core/types';

const DB_NAME = 'openbor-stats';
const DB_VERSION = 2;
const PROJECT_STORE = 'projects';
const DRAFT_STORE = 'drafts';
const SETTINGS_STORE = 'settings';
const ASSET_STORE = 'assets';
const SETTINGS_KEY = 'app';

export interface AssetRecord {
  key: string;
  projectId: string;
  path: string;
  blob: Blob;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not provide IndexedDB. Project persistence is unavailable.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const store = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'entityId' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const store = db.createObjectStore(ASSET_STORE, { keyPath: 'key' });
        store.createIndex('projectId', 'projectId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
  });
  return databasePromise;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let request: IDBRequest<T> | undefined;
    try {
      request = action(store) ?? undefined;
    } catch (error) {
      tx.abort();
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

export const storage = {
  async listProjects(): Promise<Project[]> {
    const projects = await transaction<Project[]>(PROJECT_STORE, 'readonly', (store) =>
      store.getAll(),
    );
    return (projects ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getProject(id: string): Promise<Project | null> {
    const project = await transaction<Project>(PROJECT_STORE, 'readonly', (store) =>
      store.get(id),
    );
    return project ?? null;
  },

  async saveProject(project: Project): Promise<void> {
    await transaction(PROJECT_STORE, 'readwrite', (store) => store.put(project));
  },

  async deleteProject(id: string): Promise<void> {
    await transaction(PROJECT_STORE, 'readwrite', (store) => store.delete(id));
  },

  async listDrafts(): Promise<DraftRecord[]> {
    const drafts = await transaction<DraftRecord[]>(DRAFT_STORE, 'readonly', (store) =>
      store.getAll(),
    );
    return drafts ?? [];
  },

  async getDraft(entityId: string): Promise<DraftRecord | null> {
    const draft = await transaction<DraftRecord>(DRAFT_STORE, 'readonly', (store) =>
      store.get(entityId),
    );
    return draft ?? null;
  },

  async saveDraft(draft: DraftRecord): Promise<void> {
    await transaction(DRAFT_STORE, 'readwrite', (store) => store.put(draft));
  },

  async deleteDraft(entityId: string): Promise<void> {
    await transaction(DRAFT_STORE, 'readwrite', (store) => store.delete(entityId));
  },

  async deleteDraftsForProject(projectId: string): Promise<void> {
    const drafts = await this.listDrafts();
    await Promise.all(
      drafts.filter((draft) => draft.projectId === projectId).map((draft) => this.deleteDraft(draft.entityId)),
    );
  },

  async saveAssets(projectId: string, assets: { path: string; blob: Blob }[]): Promise<void> {
    if (assets.length === 0) return;
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, 'readwrite');
      const store = tx.objectStore(ASSET_STORE);
      for (const asset of assets) {
        const record: AssetRecord = {
          key: `${projectId}\u0000${asset.path}`,
          projectId,
          path: asset.path,
          blob: asset.blob,
        };
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save project assets.'));
      tx.onabort = () => reject(tx.error ?? new Error('Saving project assets was aborted.'));
    });
  },

  async listAssets(projectId: string): Promise<AssetRecord[]> {
    const records = await transaction<AssetRecord[]>(ASSET_STORE, 'readonly', (store) =>
      store.index('projectId').getAll(projectId),
    );
    return records ?? [];
  },

  async deleteAssetsForProject(projectId: string): Promise<void> {
    const keys =
      (await transaction<IDBValidKey[]>(ASSET_STORE, 'readonly', (store) =>
        store.index('projectId').getAllKeys(projectId),
      )) ?? [];
    if (keys.length === 0) return;
    await transaction(ASSET_STORE, 'readwrite', (store) => {
      for (const key of keys) store.delete(key);
    });
  },

  async getSettings(): Promise<AppSettings | null> {
    const record = await transaction<{ id: string; settings: AppSettings }>(
      SETTINGS_STORE,
      'readonly',
      (store) => store.get(SETTINGS_KEY),
    );
    return record?.settings ?? null;
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    await transaction(SETTINGS_STORE, 'readwrite', (store) =>
      store.put({ id: SETTINGS_KEY, settings }),
    );
  },

  async clearAll(): Promise<void> {
    await Promise.all([
      transaction(PROJECT_STORE, 'readwrite', (store) => store.clear()),
      transaction(DRAFT_STORE, 'readwrite', (store) => store.clear()),
      transaction(SETTINGS_STORE, 'readwrite', (store) => store.clear()),
      transaction(ASSET_STORE, 'readwrite', (store) => store.clear()),
    ]);
  },
};

export interface BackupFile {
  format: 'openbor-stats-backup';
  version: 1;
  exportedAt: string;
  projects: Project[];
  settings?: AppSettings;
}

export function createBackup(projects: Project[], settings?: AppSettings): BackupFile {
  return {
    format: 'openbor-stats-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    settings,
  };
}

export function parseBackup(text: string): BackupFile {
  const data: unknown = JSON.parse(text);
  if (
    typeof data !== 'object' ||
    data === null ||
    !('format' in data) ||
    (data as { format?: string }).format !== 'openbor-stats-backup'
  ) {
    throw new Error('This is not an OpenBOR Stats backup file.');
  }
  const backup = data as BackupFile;
  if (!Array.isArray(backup.projects)) {
    throw new Error('The backup does not contain a projects list.');
  }
  for (const project of backup.projects) {
    if (
      typeof project.id !== 'string' ||
      typeof project.name !== 'string' ||
      !Array.isArray(project.entities)
    ) {
      throw new Error('The backup contains an invalid project record.');
    }
  }
  return backup;
}

export function requestAsPromiseForTests<T>(request: IDBRequest<T>): Promise<T> {
  return requestAsPromise(request);
}
