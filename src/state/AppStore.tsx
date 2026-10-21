import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { parseModel } from '../core/parser';
import { importFiles as runImport, newId, safeFileName, type FileInput, type ImportResult } from '../core/importer';
import { buildSummary } from '../core/summary';
import { parseProjectBundle } from '../core/projectIO';
import type {
  AppSettings,
  DraftRecord,
  Project,
  ProjectEntity,
  ValidationFinding,
} from '../core/types';
import { validateProject, type ProjectValidation } from '../core/validation';
import { createBackup, parseBackup, storage, type BackupFile } from '../storage/db';
import { forgetProjectAssets } from '../lib/assets';

const ACTIVE_PROJECT_KEY = 'openbor-stats-active-project';
const DRAFT_THROTTLE_MS = 700;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  autosaveDrafts: true,
  showWelcome: true,
  editorFontSize: 13,
};

export interface Notice {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface AppContextValue {
  ready: boolean;
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  settings: AppSettings;
  drafts: Record<string, DraftRecord>;
  notices: Notice[];
  persistenceError: string | null;
  validation: ProjectValidation | null;
  createProject: (name: string, description: string, imported?: ImportResult) => Promise<Project>;
  setActiveProject: (id: string | null) => void;
  updateProject: (project: Project) => Promise<void>;
  renameProject: (id: string, name: string, description: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  importIntoProject: (projectId: string, files: FileInput[]) => Promise<ImportResult>;
  saveEntity: (projectId: string, entityId: string, raw: string, label?: string) => Promise<boolean>;
  saveDraft: (projectId: string, entityId: string, raw: string) => void;
  clearDraft: (projectId: string, entityId: string) => Promise<void>;
  deleteEntity: (projectId: string, entityId: string) => Promise<void>;
  duplicateEntity: (projectId: string, entityId: string) => Promise<void>;
  renameEntity: (projectId: string, entityId: string, fileName: string) => Promise<void>;
  setEntityNote: (projectId: string, entityId: string, note: string) => Promise<void>;
  saveModelsFile: (projectId: string, raw: string) => Promise<void>;
  rememberEntity: (projectId: string, entityId: string) => void;
  reportEntityIssues: (entityId: string, findings: ValidationFinding[]) => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  notify: (message: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: string) => void;
  exportBackupFile: () => BackupFile;
  importBackupText: (text: string, mode: 'merge' | 'replace') => Promise<void>;
  importProjectBundleText: (text: string) => Promise<void>;
  clearAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function withSummary(entity: ProjectEntity): ProjectEntity {
  const summary = buildSummary(entity.raw);
  return { ...entity, summary, updatedAt: Date.now() };
}

function initialRevision(entity: ProjectEntity, label = 'Imported'): ProjectEntity['revisions'][number] {
  return {
    id: newId(),
    savedAt: entity.updatedAt,
    label,
    raw: entity.raw,
    stats: parseModel(entity.raw).stats,
  };
}

function addImportedEntities(project: Project, imported: ImportResult): Project {
  const stamp = Date.now();
  const entities = imported.entities.map((entity) => {
    const hydrated: ProjectEntity = {
      ...entity,
      createdAt: stamp,
      updatedAt: stamp,
      revisions: [initialRevision(entity)],
    };
    return withSummary(hydrated);
  });
  const assetPaths = [...new Set([...project.assetPaths, ...imported.assetPaths])];
  return {
    ...project,
    entities: [...project.entities, ...entities],
    modelsFile: imported.modelsFile ?? project.modelsFile,
    assetPaths,
    updatedAt: stamp,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_PROJECT_KEY),
  );
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const notify = useCallback((message: string, tone: Notice['tone'] = 'info') => {
    const notice = { id: newId(), message, tone };
    setNotices((current) => [...current.slice(-3), notice]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== notice.id));
    }, tone === 'error' ? 7000 : 4200);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      try {
        const [storedProjects, storedDrafts, storedSettings] = await Promise.all([
          storage.listProjects(),
          storage.listDrafts(),
          storage.getSettings(),
        ]);
        // Rebuild summaries from the saved text so issue counts and stats never
        // depend on whichever parser version produced the stored summary.
        const refreshedProjects = storedProjects.map((project) => ({
          ...project,
          entities: project.entities.map((entity) =>
            typeof entity.raw === 'string'
              ? { ...entity, summary: buildSummary(entity.raw) }
              : entity,
          ),
        }));
        setProjects(refreshedProjects);
        setDrafts(Object.fromEntries(storedDrafts.map((draft) => [draft.entityId, draft])));
        if (storedSettings) setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
        const requested = activeProjectId;
        if (!requested || !refreshedProjects.some((project) => project.id === requested)) {
          const fallback = refreshedProjects[0]?.id ?? null;
          setActiveProjectId(fallback);
          if (fallback) localStorage.setItem(ACTIVE_PROJECT_KEY, fallback);
        }
      } catch (error) {
        setPersistenceError(
          error instanceof Error
            ? error.message
            : 'Local storage is unavailable. Changes will not survive a reload.',
        );
      } finally {
        setReady(true);
      }
    })();
  }, [activeProjectId]);

  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.theme;
    root.dataset.theme = resolved;
    root.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`);
  }, [settings]);

  useEffect(() => {
    const timers = draftTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const validation = useMemo(() => (activeProject ? validateProject(activeProject) : null), [activeProject]);

  const persistProject = useCallback(
    async (project: Project) => {
      try {
        await storage.saveProject(project);
      } catch (error) {
        setPersistenceError(
          error instanceof Error ? error.message : 'Could not save the project to IndexedDB.',
        );
        notify('Could not write to local storage. Keep this tab open and export a backup.', 'error');
      }
    },
    [notify],
  );

  const setActiveProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }, []);

  const createProject = useCallback(
    async (name: string, description: string, imported?: ImportResult) => {
      const stamp = Date.now();
      let project: Project = {
        id: newId(),
        name: name.trim() || 'Untitled project',
        description: description.trim(),
        createdAt: stamp,
        updatedAt: stamp,
        entities: [],
        modelsFile: null,
        modelsFileName: 'models.txt',
        assetPaths: [],
      };
      if (imported) project = addImportedEntities(project, imported);
      setProjects((current) => [project, ...current]);
      setActiveProject(project.id);
      await persistProject(project);
      if (imported?.assetBlobs.length) {
        await storage.saveAssets(project.id, imported.assetBlobs).catch(() => {
          notify('Some project images could not be saved to local storage.', 'error');
        });
        forgetProjectAssets(project.id);
      }
      notify(`Project "${project.name}" created.`, 'success');
      return project;
    },
    [notify, persistProject, setActiveProject],
  );

  const updateProject = useCallback(
    async (project: Project) => {
      const next = { ...project, updatedAt: Date.now() };
      setProjects((current) => current.map((item) => (item.id === next.id ? next : item)));
      await persistProject(next);
    },
    [persistProject],
  );

  const renameProject = useCallback(
    async (id: string, name: string, description: string) => {
      const project = projects.find((item) => item.id === id);
      if (!project) return;
      await updateProject({ ...project, name: name.trim() || project.name, description: description.trim() });
      notify('Project details updated.', 'success');
    },
    [notify, projects, updateProject],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const project = projects.find((item) => item.id === id);
      setProjects((current) => current.filter((item) => item.id !== id));
      if (activeProjectId === id) {
        const fallback = projects.find((item) => item.id !== id)?.id ?? null;
        setActiveProject(fallback);
      }
      try {
        await storage.deleteProject(id);
        await storage.deleteDraftsForProject(id);
        await storage.deleteAssetsForProject(id);
        forgetProjectAssets(id);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not remove the project.', 'error');
      }
      setDrafts((current) => {
        const next = { ...current };
        for (const draft of Object.values(current)) {
          if (draft.projectId === id) delete next[draft.entityId];
        }
        return next;
      });
      notify(`Deleted project "${project?.name ?? 'project'}".`, 'success');
    },
    [activeProjectId, notify, projects, setActiveProject],
  );

  const duplicateProject = useCallback(
    async (id: string) => {
      const source = projects.find((project) => project.id === id);
      if (!source) return;
      const stamp = Date.now();
      const copy: Project = {
        ...source,
        id: newId(),
        name: `${source.name} copy`,
        createdAt: stamp,
        updatedAt: stamp,
        entities: source.entities.map((entity) => ({
          ...entity,
          id: newId(),
          createdAt: stamp,
          updatedAt: stamp,
          revisions: [...entity.revisions],
        })),
      };
      setProjects((current) => [copy, ...current]);
      setActiveProject(copy.id);
      await persistProject(copy);
      notify(`Duplicated "${source.name}".`, 'success');
    },
    [notify, persistProject, projects, setActiveProject],
  );

  const importIntoProject = useCallback(
    async (projectId: string, files: FileInput[]) => {
      const project = projects.find((item) => item.id === projectId);
      const result = runImport(files);
      if (!project) return result;
      const next = addImportedEntities(project, result);
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      await persistProject(next);
      if (result.assetBlobs.length > 0) {
        await storage.saveAssets(projectId, result.assetBlobs).catch(() => {
          notify('Some images could not be saved to local storage.', 'error');
        });
        forgetProjectAssets(projectId);
      }
      if (result.entities.length > 0) {
        notify(
          `Imported ${result.entities.length} model${result.entities.length === 1 ? '' : 's'}${
            result.errors.length ? ` with ${result.errors.length} error(s)` : ''
          }.`,
          result.errors.length ? 'info' : 'success',
        );
      } else if (result.errors.length > 0) {
        notify(result.errors[0].message, 'error');
      }
      return result;
    },
    [notify, persistProject, projects],
  );

  const saveEntity = useCallback(
    async (projectId: string, entityId: string, raw: string, label?: string) => {
      const project = projects.find((item) => item.id === projectId);
      const entity = project?.entities.find((item) => item.id === entityId);
      if (!project || !entity) return false;
      let parsed;
      try {
        parsed = parseModel(raw);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'The model could not be parsed.', 'error');
        return false;
      }
      const summary = buildSummary(raw);
      const revision = {
        id: newId(),
        savedAt: Date.now(),
        label: label?.trim() || `Saved ${new Date().toLocaleString()}`,
        raw,
        stats: parsed.stats,
      };
      const revisions =
        entity.raw === raw && entity.revisions.length > 0
          ? entity.revisions
          : [revision, ...entity.revisions].slice(0, 25);
      const nextEntity: ProjectEntity = {
        ...entity,
        raw,
        savedRaw: raw,
        updatedAt: Date.now(),
        summary,
        revisions,
      };
      const nextProject: Project = {
        ...project,
        entities: project.entities.map((item) => (item.id === entityId ? nextEntity : item)),
        lastOpenedEntityId: entityId,
        updatedAt: Date.now(),
      };
      setProjects((current) => current.map((item) => (item.id === projectId ? nextProject : item)));
      await persistProject(nextProject);
      if (draftTimers.current[entityId]) {
        clearTimeout(draftTimers.current[entityId]);
        delete draftTimers.current[entityId];
      }
      setDrafts((current) => {
        if (!current[entityId]) return current;
        const next = { ...current };
        delete next[entityId];
        return next;
      });
      try {
        await storage.deleteDraft(entityId);
      } catch {
        // The project save is authoritative; a stale draft is harmless.
      }
      notify('Entity saved locally with a new revision.', 'success');
      return true;
    },
    [notify, persistProject, projects],
  );

  const saveDraft = useCallback(
    (projectId: string, entityId: string, raw: string) => {
      if (!settings.autosaveDrafts) return;
      if (draftTimers.current[entityId]) clearTimeout(draftTimers.current[entityId]);
      draftTimers.current[entityId] = setTimeout(() => {
        const draft: DraftRecord = { entityId, projectId, raw, updatedAt: Date.now() };
        setDrafts((current) => ({ ...current, [entityId]: draft }));
        void storage.saveDraft(draft).catch(() => {
          setPersistenceError('Draft autosave failed. Save the entity or export a backup.');
        });
        delete draftTimers.current[entityId];
      }, DRAFT_THROTTLE_MS);
    },
    [settings.autosaveDrafts],
  );

  const clearDraft = useCallback(async (projectId: string, entityId: string) => {
    if (draftTimers.current[entityId]) {
      clearTimeout(draftTimers.current[entityId]);
      delete draftTimers.current[entityId];
    }
    setDrafts((current) => {
      if (!current[entityId]) return current;
      const next = { ...current };
      delete next[entityId];
      return next;
    });
    try {
      await storage.deleteDraft(entityId);
    } catch {
      // ignored: draft cleanup is best-effort
    }
    void projectId;
  }, []);

  const deleteEntity = useCallback(
    async (projectId: string, entityId: string) => {
      const project = projects.find((item) => item.id === projectId);
      const entity = project?.entities.find((item) => item.id === entityId);
      if (!project || !entity) return;
      const next: Project = {
        ...project,
        entities: project.entities.filter((item) => item.id !== entityId),
        lastOpenedEntityId:
          project.lastOpenedEntityId === entityId ? undefined : project.lastOpenedEntityId,
        updatedAt: Date.now(),
      };
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      await persistProject(next);
      await clearDraft(projectId, entityId);
      notify(`Deleted "${entity.summary.name ?? entity.fileName}".`, 'success');
    },
    [clearDraft, notify, persistProject, projects],
  );

  const duplicateEntity = useCallback(
    async (projectId: string, entityId: string) => {
      const project = projects.find((item) => item.id === projectId);
      const entity = project?.entities.find((item) => item.id === entityId);
      if (!project || !entity) return;
      const stamp = Date.now();
      const base = entity.fileName.replace(/\.txt$/i, '');
      const copy: ProjectEntity = withSummary({
        ...entity,
        id: newId(),
        fileName: `${base}_copy.txt`,
        path: entity.path.replace(/[^/]+\.txt$/i, `${base}_copy.txt`),
        createdAt: stamp,
        updatedAt: stamp,
        revisions: [
          {
            id: newId(),
            savedAt: stamp,
            label: 'Duplicated',
            raw: entity.raw,
            stats: parseModel(entity.raw).stats,
          },
        ],
        summary: entity.summary,
      });
      const next = {
        ...project,
        entities: [...project.entities, copy],
        updatedAt: stamp,
      };
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      await persistProject(next);
      notify('Entity duplicated. Rename the header and file path before registering it.', 'success');
    },
    [notify, persistProject, projects],
  );

  const renameEntity = useCallback(
    async (projectId: string, entityId: string, fileName: string) => {
      const project = projects.find((item) => item.id === projectId);
      const entity = project?.entities.find((item) => item.id === entityId);
      if (!project || !entity) return;
      const safe = safeFileName(fileName);
      if (!safe.toLowerCase().endsWith('.txt')) {
        notify('Model files must keep a .txt extension.', 'error');
        return;
      }
      const directory = entity.path.replace(/[^/]+$/, '');
      const next = {
        ...project,
        entities: project.entities.map((item) =>
          item.id === entityId
            ? { ...item, fileName: safe, path: `${directory}${safe}`, updatedAt: Date.now() }
            : item,
        ),
        updatedAt: Date.now(),
      };
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      await persistProject(next);
      notify('File renamed. Update models.txt if it references the old path.', 'success');
    },
    [notify, persistProject, projects],
  );

  const setEntityNote = useCallback(
    async (projectId: string, entityId: string, note: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
      const next = {
        ...project,
        entities: project.entities.map((item) =>
          item.id === entityId ? { ...item, notes: note, updatedAt: Date.now() } : item,
        ),
        updatedAt: Date.now(),
      };
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      await persistProject(next);
    },
    [persistProject, projects],
  );

  const saveModelsFile = useCallback(
    async (projectId: string, raw: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;
      const next = { ...project, modelsFile: raw, updatedAt: Date.now() };
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      await persistProject(next);
      notify('models.txt saved locally.', 'success');
    },
    [notify, persistProject, projects],
  );

  const rememberEntity = useCallback(
    (projectId: string, entityId: string) => {
      const project = projects.find((item) => item.id === projectId);
      if (!project || project.lastOpenedEntityId === entityId) return;
      const next = { ...project, lastOpenedEntityId: entityId };
      setProjects((current) => current.map((item) => (item.id === projectId ? next : item)));
      void persistProject(next);
    },
    [persistProject, projects],
  );

  const reportEntityIssues = useCallback(
    (entityId: string, findings: ValidationFinding[]) => {
      setProjects((current) => {
        let changed = false;
        const next = current.map((project) => {
          if (!project.entities.some((entity) => entity.id === entityId)) return project;
          return {
            ...project,
            entities: project.entities.map((entity) => {
              if (entity.id !== entityId) return entity;
              const errors = findings.filter((finding) => finding.severity === 'error').length;
              const warnings = findings.filter((finding) => finding.severity === 'warning').length;
              if (entity.summary.errors === errors && entity.summary.warnings === warnings) return entity;
              changed = true;
              return { ...entity, summary: { ...entity.summary, errors, warnings } };
            }),
          };
        });
        return changed ? next : current;
      });
    },
    [],
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        await storage.saveSettings(next);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not save settings.', 'error');
      }
    },
    [notify, settings],
  );

  const exportBackupFile = useCallback(
    () => createBackup(projects, settings),
    [projects, settings],
  );

  const importBackupText = useCallback(
    async (text: string, mode: 'merge' | 'replace') => {
      const backup = parseBackup(text);
      const stamp = Date.now();
      const incoming = backup.projects.map((project) => ({
        ...project,
        entities: project.entities.map((entity) => ({
          ...entity,
          summary: entity.summary ?? buildSummary(entity.raw),
          revisions: entity.revisions ?? [],
        })),
        updatedAt: project.updatedAt || stamp,
      }));
      let nextProjects: Project[];
      if (mode === 'replace') {
        nextProjects = incoming;
      } else {
        const existing = new Set(projects.map((project) => project.id));
        nextProjects = [
          ...incoming.map((project) =>
            existing.has(project.id)
              ? {
                  ...project,
                  id: newId(),
                  name: `${project.name} (imported)`,
                  createdAt: stamp,
                  updatedAt: stamp,
                }
              : project,
          ),
          ...projects,
        ];
      }
      setProjects(nextProjects);
      for (const project of nextProjects) await storage.saveProject(project);
      if (backup.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
        await storage.saveSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
      }
      if (nextProjects[0]) setActiveProject(nextProjects[0].id);
      notify(
        `Imported ${backup.projects.length} project${backup.projects.length === 1 ? '' : 's'} from backup.`,
        'success',
      );
    },
    [notify, projects, setActiveProject],
  );

  const importProjectBundleText = useCallback(
    async (text: string) => {
      const project = parseProjectBundle(text);
      const stamp = Date.now();
      const imported: Project = {
        ...project,
        id: newId(),
        name: projects.some((item) => item.name === project.name)
          ? `${project.name} (imported)`
          : project.name,
        createdAt: stamp,
        updatedAt: stamp,
        entities: project.entities.map((entity) => ({
          ...entity,
          id: newId(),
          summary: entity.summary ?? buildSummary(entity.raw),
          revisions: Array.isArray(entity.revisions) ? entity.revisions : [],
        })),
      };
      setProjects((current) => [imported, ...current]);
      setActiveProject(imported.id);
      await persistProject(imported);
      notify(`Imported project "${imported.name}".`, 'success');
    },
    [notify, persistProject, projects, setActiveProject],
  );

  const clearAllData = useCallback(async () => {
    await storage.clearAll();
    setProjects([]);
    setDrafts({});
    setSettings(DEFAULT_SETTINGS);
    setActiveProject(null);
    notify('All locally stored projects, drafts, and settings were removed.', 'success');
  }, [notify, setActiveProject]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      projects,
      activeProject,
      activeProjectId,
      settings,
      drafts,
      notices,
      persistenceError,
      validation,
      createProject,
      setActiveProject,
      updateProject,
      renameProject,
      deleteProject,
      duplicateProject,
      importIntoProject,
      saveEntity,
      saveDraft,
      clearDraft,
      deleteEntity,
      duplicateEntity,
      renameEntity,
      setEntityNote,
      saveModelsFile,
      rememberEntity,
      reportEntityIssues,
      updateSettings,
      notify,
      dismissNotice,
      exportBackupFile,
      importBackupText,
      importProjectBundleText,
      clearAllData,
    }),
    [
      ready,
      projects,
      activeProject,
      activeProjectId,
      settings,
      drafts,
      notices,
      persistenceError,
      validation,
      createProject,
      setActiveProject,
      updateProject,
      renameProject,
      deleteProject,
      duplicateProject,
      importIntoProject,
      saveEntity,
      saveDraft,
      clearDraft,
      deleteEntity,
      duplicateEntity,
      renameEntity,
      setEntityNote,
      saveModelsFile,
      rememberEntity,
      reportEntityIssues,
      updateSettings,
      notify,
      dismissNotice,
      exportBackupFile,
      importBackupText,
      importProjectBundleText,
      clearAllData,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
