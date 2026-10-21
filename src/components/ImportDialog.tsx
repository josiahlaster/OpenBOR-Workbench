import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderOpen,
  UploadCloud,
} from 'lucide-react';
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
import { acceptedFileTypes, importFiles, readFilesFromList, type FileInput, type ImportResult } from '../core/importer';
import { navigate } from '../lib/router';
import { useApp } from '../state/AppStore';
import { Button, Field, Modal } from './ui';

type ImportMode = 'create' | 'into';

interface ImportContextValue {
  openImport: (mode?: ImportMode) => void;
  closeImport: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

/** Minimal shape of the File System Access API directory handles used for folder import. */
interface DirectoryHandleLike {
  kind: 'directory' | 'file';
  name: string;
  getFile?: () => Promise<File>;
  entries?: () => AsyncIterable<[string, DirectoryHandleLike]>;
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
}

/** Walk a chosen folder, keeping each file's path relative to the folder that was picked. */
async function collectDirectory(dir: DirectoryHandleLike, prefix: string, out: File[]): Promise<void> {
  if (!dir.entries) return;
  for await (const [name, child] of dir.entries()) {
    const path = `${prefix}${name}`;
    if (child.kind === 'file' && child.getFile) {
      const file = await child.getFile();
      Object.defineProperty(file, 'webkitRelativePath', { value: path });
      out.push(file);
    } else if (child.kind === 'directory') {
      await collectDirectory(child, `${path}/`, out);
    }
  }
}

function readEntriesBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function collectEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    Object.defineProperty(file, 'webkitRelativePath', {
      value: entry.fullPath.replace(/^\/+/, ''),
    });
    out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns results in batches; keep reading until an empty batch.
    for (;;) {
      const batch = await readEntriesBatch(reader);
      if (batch.length === 0) break;
      for (const child of batch) await collectEntry(child, out);
    }
  }
}

/**
 * Dropped folders arrive as directory entries; dataTransfer.files lists only their top-level
 * files. Walk the entries so nested subfolders are imported with their relative paths.
 */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  // Entries must be captured synchronously, during the drop event.
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return Array.from(dataTransfer.files);
  const out: File[] = [];
  for (const entry of entries) await collectEntry(entry, out);
  return out;
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const { activeProject } = useApp();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>('create');
  const openImport = useCallback(
    (requested?: ImportMode) => {
      setMode(requested ?? (activeProject ? 'into' : 'create'));
      setOpen(true);
    },
    [activeProject],
  );
  const closeImport = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openImport, closeImport }), [openImport, closeImport]);
  return (
    <ImportContext.Provider value={value}>
      {children}
      <ImportDialog open={open} initialMode={mode} onClose={closeImport} />
    </ImportContext.Provider>
  );
}

export function useImport(): ImportContextValue {
  const context = useContext(ImportContext);
  if (!context) throw new Error('useImport must be used inside ImportProvider');
  return context;
}

function ImportDialog({
  open,
  initialMode,
  onClose,
}: {
  open: boolean;
  initialMode: ImportMode;
  onClose: () => void;
}) {
  const { activeProject, createProject, importIntoProject, notify } = useApp();
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [files, setFiles] = useState<FileInput[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(activeProject ? initialMode : 'create');
    setFiles([]);
    setPreview(null);
    setProjectName(activeProject && initialMode === 'into' ? activeProject.name : '');
    setDescription('');
    setReadError(null);
    setBusy(false);
    setReading(false);
  }, [open, initialMode, activeProject]);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, [open]);

  const loadFiles = async (list: FileList | File[]) => {
    setReading(true);
    setReadError(null);
    try {
      const read = await readFilesFromList(list);
      setFiles(read);
      setPreview(importFiles(read));
      if (!projectName) {
        const firstPath = read.find((file) => file.path?.includes('/'))?.path;
        const folder = firstPath?.split('/').slice(0, -1).filter(Boolean).pop();
        setProjectName(folder || activeProject?.name || '');
      }
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'The selected files could not be read.');
    } finally {
      setReading(false);
    }
  };

  /** Opens the system folder picker when the browser has one; otherwise falls back to the folder input. */
  const chooseFolder = () => {
    const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }
    // Call the picker synchronously so the click keeps its user activation.
    const request = picker.call(window, { mode: 'read' });
    setReading(true);
    void request
      .then(async (root) => {
        const picked: File[] = [];
        await collectDirectory(root, `${root.name}/`, picked);
        await loadFiles(picked);
      })
      .catch((error: unknown) => {
        setReading(false);
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setReadError('The folder could not be read. Try Choose files instead.');
      });
  };

  const resetSelection = () => {
    setFiles([]);
    setPreview(null);
    setReadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const finish = async () => {
    if (!preview || preview.entities.length === 0) return;
    setBusy(true);
    try {
      if (mode === 'create') {
        const project = await createProject(projectName || 'Imported project', description, preview);
        notify(
          `${preview.entities.length} model${preview.entities.length === 1 ? '' : 's'} imported into "${project.name}".`,
          'success',
        );
      } else if (activeProject) {
        await importIntoProject(activeProject.id, files);
      }
      onClose();
      navigate('entities');
    } finally {
      setBusy(false);
    }
  };

  const entityCount = preview?.entities.length ?? 0;
  const canSubmit = Boolean(preview && entityCount > 0 && (mode === 'into' ? activeProject : projectName.trim()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import OpenBOR files"
      subtitle="OpenBOR model .txt files, models.txt, and asset paths. Files are parsed in this browser and never uploaded."
      wide
      footer={
        <>
          <span className="small muted" style={{ marginRight: 'auto' }}>
            {entityCount > 0
              ? `${entityCount} model${entityCount === 1 ? '' : 's'} ready`
              : 'Select model files to continue'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void finish()} disabled={!canSubmit || busy} loading={busy}>
            {mode === 'create' ? 'Create project' : 'Import into project'}
          </Button>
        </>
      }
    >
      {activeProject ? (
        <div className="segmented" role="group" aria-label="Import destination">
          <button
            type="button"
            className={mode === 'into' ? 'active' : ''}
            onClick={() => {
              setMode('into');
              if (!projectName) setProjectName(activeProject.name);
            }}
          >
            Into {activeProject.name}
          </button>
          <button
            type="button"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => {
              setMode('create');
              // Do not carry the active project's name into a brand-new project.
              if (projectName === activeProject.name) setProjectName('');
            }}
          >
            New project
          </button>
        </div>
      ) : null}

      {mode === 'create' ? (
        <div className="grid grid-2" style={{ gap: 10 }}>
          <Field label="Project name" htmlFor="import-project-name" required>
            <input
              id="import-project-name"
              className="input"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="My OpenBOR project"
            />
          </Field>
          <Field label="Description" htmlFor="import-description" hint="Optional">
            <input
              id="import-description"
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A short note about this project"
            />
          </Field>
        </div>
      ) : null}

      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void filesFromDrop(event.dataTransfer)
            .then((dropped) => {
              if (dropped.length) return loadFiles(dropped);
              return undefined;
            })
            .catch(() => setReadError('The dropped folder could not be read. Try Choose folder instead.'));
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="dz-icon">
          <UploadCloud size={18} />
        </div>
        <strong>{reading ? 'Reading files…' : 'Drop files here, or click to browse'}</strong>
        <span>Select one or more model .txt files, or a whole data folder</span>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }} onClick={(event) => event.stopPropagation()}>
          <Button size="sm" icon={FileText} onClick={() => fileInputRef.current?.click()}>
            Choose files
          </Button>
          <Button size="sm" icon={FolderOpen} onClick={chooseFolder}>
            Choose folder
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedFileTypes()}
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void loadFiles(event.target.files);
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void loadFiles(event.target.files);
          }}
        />
      </div>

      {readError ? <div className="alert-banner"><AlertTriangle size={14} />{readError}</div> : null}

      {preview ? (
        <>
          <div className="import-summary">
            <div>
              <strong>{preview.entities.length}</strong>
              <span>Models</span>
            </div>
            <div>
              <strong>{preview.modelsFile ? '1' : '0'}</strong>
              <span>models.txt</span>
            </div>
            <div>
              <strong>{preview.assetPaths.length}</strong>
              <span>Asset paths</span>
            </div>
          </div>
          {files.length > 0 ? (
            <div className="small muted">
              Selected {files.length} file{files.length === 1 ? '' : 's'}
              {preview.skipped ? ` · ${preview.skipped} skipped` : ''}. Text is parsed locally; images are stored in this browser for the sprite editor, and
              audio is indexed by path.
            </div>
          ) : null}
          {preview.errors.length > 0 ? (
            <div className="issue-list" aria-label="Import errors">
              {preview.errors.map((error, index) => (
                <div className="issue-line" key={`${error.fileName}-${index}`}>
                  <AlertTriangle size={13} className="text-danger" style={{ flexShrink: 0 }} />
                  <span>
                    <strong>{error.fileName || 'Import'}:</strong> {error.message}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {preview.warnings.length > 0 ? (
            <details>
              <summary className="small muted" style={{ cursor: 'pointer' }}>
                {preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}
              </summary>
              <div className="issue-list" style={{ marginTop: 6 }} aria-label="Import warnings">
                {preview.warnings.map((warning, index) => (
                  <div className="issue-line" key={`${warning.fileName}-${index}`}>
                    <AlertTriangle size={13} className="text-warning" style={{ flexShrink: 0 }} />
                    <span>
                      <strong>{warning.fileName || 'Import'}:</strong> {warning.message}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {entityCount > 0 ? (
            <div className="row small text-success">
              <CheckCircle2 size={13} />
              Comments, scripts, indentation, and unknown commands will be preserved exactly.
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={resetSelection}>
              Clear selection
            </Button>
          </div>
        </>
      ) : (
        <div className="small muted">
          Limits: 2 MB per .txt file, 1 GB total, 20,000 files per import. Folders are read recursively,
          including nested subfolders. Level .txt files are listed under Levels and are
          edited as text.
        </div>
      )}
    </Modal>
  );
}
