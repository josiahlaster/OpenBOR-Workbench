# OpenBOR Stats

OpenBOR Stats is a web application for inspecting, editing, validating, and comparing OpenBOR model `.txt` files. It runs entirely in your browser. No account is required, and no files are uploaded to a server. Projects are saved locally in the browser's IndexedDB storage.

## Opening the app

There are two ways to use it.

**Hosted version.** Go to:

```
https://josiahlaster.github.io/OpenBOR-Workbench/
```

This is served from GitHub Pages. Nothing is installed. (Note: if this URL does not work yet, the repository's Pages source still needs to be set to GitHub Actions under Settings, Pages.)

**Run it locally.** You need Node.js 18 or newer.

```
npm install
npm run dev
```

Then open `http://localhost:5173`.

For a production build in a local folder, run `npm run build` and then `npm run preview`.

Your data is tied to the browser profile and origin you use. The hosted site and a local server keep separate projects.

## Quick start

1. Open the app.
2. Click **Import** (top bar) or **Import your first project** on the dashboard.
3. Select one or more model `.txt` files, or a whole game data folder containing a `data` directory.
4. Enter a project name and click **Create project**.
5. Browse and edit the models on the pages described below.
6. When finished, download the edited `.txt` files or export the project and copy them back into your OpenBOR game folder.

## The interface

The left sidebar has three groups.

**Workspace**

| Page | Purpose |
| --- | --- |
| Dashboard | Statistics for the active project: entity counts, animations, frames, total attack damage, health and speed distributions, damage leaders, recent activity, and a live validation summary. |
| Projects | Create, rename, duplicate, delete, export, and import projects. Also import a previously exported project bundle (.json). |
| Entities | List and search all models in the active project by name, file, path, or type. Shows a project tree or a table. Single place to download a model or start the browser playtest. |
| Editor | Full editing workspace for one model file. See "Editing a model" below. |
| models.txt | View and edit the models.txt manifest that registers models with the OpenBOR engine. |

**Analysis**

| Page | Purpose |
| --- | --- |
| Compare | Compare two entities, or two saved revisions of one entity. Shows health, speed, animation timing, damage, hits, header fields, and per-animation differences with percentage changes. A "Changed only" filter hides identical rows. |
| Validation | All findings across the project: required headers, numeric ranges, attack boxes, animation issues, and models.txt references. Each finding has a severity, the file, the line, and a rule code. Reports can be downloaded. |

**Reference**

| Page | Purpose |
| --- | --- |
| Documentation | In-app reference about parsing and validation. |
| Settings | Theme, editor preferences, backup and restore, and local data management. |

Use the **Active project** selector at the top of the sidebar to switch between projects. If no project is selected, most pages prompt you to open one.

## Importing files

The import dialog accepts:

- One or more model `.txt` files (characters, enemies, NPCs, items, obstacles, and other entity types).
- A whole folder. Folders are read recursively, including nested subfolders, and each file keeps its path relative to the folder. Pick a folder that contains the game's `data` directory so paths resolve correctly.
- A `models.txt` file, which is stored with the project and indexed.
- Level `.txt` files, which are listed under Levels and edited as raw text.
- Images and audio found in the folder. Images are stored in the browser for the sprite editor; audio is indexed by path only.

Drag files onto the dialog, click **Choose files**, or click **Choose folder**. Files can also be dropped against other import entry points.

Before anything is created, the dialog shows a preview: how many models were found, whether a models.txt was recognized, how many asset paths were indexed, and any errors or warnings. Nothing is parsed on a server; all parsing happens in the browser.

Import limits: 2 MB per `.txt` file, 1 GB total, and 20,000 files per import.

The importer preserves the original text. Comments, scripts, indentation, spacing, and commands that OpenBOR Stats does not recognize are kept byte for byte and appear again in exports.

## Editing a model

Open an entity from the **Entities** page or the **Editor** link in the sidebar. The editor offers several views:

- **Structure views** for headers and animation frames: edit supported fields and the app patches the exact lines affected. The rest of the file is untouched.
- **Raw text view**: a plain textarea showing the exact file text. This is the escape hatch for unsupported commands, custom animation logic, and scripts. Whatever is in this box is what gets exported.
- **History**: each save creates a revision. Revisions keep the full text at that moment, can be downloaded, and can be compared on the Compare page.
- **Live parse panel**: shows the parsed name, type, animation count, frame count, attack windows, damage, and any parse issues for the current text, without saving.

Workflow: make changes, click **Save** (or press Ctrl+S) to commit the text and create a revision, or use **Download .txt** to write the current file to disk. Unsaved changes are kept as a local draft (autosaved after a short delay if enabled) and the browser warns before closing the tab while drafts exist.

Undo and redo (Ctrl+Z / Ctrl+Shift+Z) work across the editor's actions.

## Editing models.txt

The **models.txt** page is a text editor plus checks for the manifest that tells OpenBOR which models to load (`load <name> <path-relative-to-data>`).

- **Generate from entities** builds load entries from the models currently in the project, preserving non-load lines and comments from any existing manifest. Review the result before saving.
- **Load file** imports a models.txt from disk into the editor.
- **Download** writes the current text to disk as a .txt file.
- **Save manifest** stores it in the project.

Statistics and tables below the editor show load entries, missing references (entries whose model is not imported or whose path differs), and unregistered entities (imported models not listed in the manifest).

The manifest is stored in the project only. Copy or download it into your game's `data` directory for the real OpenBOR build.

## Comparing models

On **Compare**, pick two entities from dropdowns (or two revisions of one entity). The page shows:

- Metric cards with values for both sides and a percentage change.
- A header diff table, optionally filtered to changed rows only.
- An animation table with frames, delay, damage, and hits per side, marking added and removed animations.
- Summary figures: total frames, animations, total delay, damage, separate hits, max hit, and animation duration in seconds.

Every number comes from the imported or saved model text. Comparison links let you jump straight into editing either side.

## Validation

**Validation** analyses all saved models in the project against engine-aware checks: required headers, numeric ranges, attack boxes, animation structure, and cross-references with models.txt. Findings are grouped per entity with severity (error, warning, info), rule code, line number, and animation name where relevant. A downloadable report is available. The editor and dashboard show the same findings live.

## Playing a project in the browser

On **Entities**, the **Play in browser** button packages the active project (models, models.txt, and imported assets) as a zip and opens the bundled OpenBOR WebAssembly engine (`public/openbor-wasm`) in a new tab. The zip is handed over through a same-origin browser cache under a one-time key; nothing leaves your computer.

Requirements and notes:

- The browser engine only runs what fits the OpenBOR WebAssembly build's capabilities, not every feature of a desktop OpenBOR build.
- The project needs a valid models.txt so the engine knows which models to load.
- Content paths are resolved the same way the engine resolves them from a game root `data` directory.
- The engine download is large; the first load in a tab takes a moment.

This playtest is a quick check. Final behaviour should still be verified in the desktop OpenBOR build.

## Exporting and backups

Three levels of export exist:

- **Single file.** Download buttons in the Editor, Entities, and models.txt pages write the current `.txt` text to disk.
- **Project bundle.** Projects page, **Export**, writes `<project-name>.openborstats.json`. This bundle contains all entity texts, summaries, revision history, the models.txt manifest, and the asset path index. It can be re-imported with **Import bundle**. Bundles do not contain image or audio data.
- **Full backup.** Settings, **Export all projects**, writes one `.json` backup of every project plus settings. **Import backup** restores it, with a choice of merging projects or replacing all current data. Backups also exclude image and audio files.

Treat downloaded `.txt` files and bundles as the portable source of truth. Data kept only in the browser can be lost by clearing site data, a different browser or profile, or private browsing.

## Settings

- **Theme**: dark, light, or follow the system.
- **Autosave drafts**: keeps unsaved editor text in IndexedDB so a reload does not lose work.
- **Editor font size**: adjusts the monospace font in the raw text editor and models.txt editor.
- **Preferences reset**, storage usage estimate, and **Clear all local data**, which permanently deletes all projects, drafts, and settings in this browser.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+S | Save the current editor text (or the manifest). |
| Ctrl+Z | Undo the last editor action. |
| Ctrl+Shift+Z | Redo. |

## Data storage and privacy

- All projects live in the browser's IndexedDB storage. Preferences live in local storage.
- The app makes no network calls for your data. Import, parsing, editing, export, and the playtest all run locally.
- Projects are per browser profile. There is no account and no sync between devices or browsers.
- IndexedDB storage is subject to browser eviction and disk quota. Export regularly if a project matters.

## Known limitations

- Export compatibility is textual: unknown commands and formatting are preserved exactly, but the app does not execute OpenBOR to verify that exported files run in a specific engine build. Always test exports in OpenBOR itself.
- Backups and project bundles do not include image or audio file contents, only the entity texts, manifest, and asset path index.
- The hosted site uses a `/OpenBOR-Workbench/` base path (the repository name). Renaming the repository changes the site URL and requires updating the base path in `vite.config.ts` and rebuilding. A custom domain would also require a base path change.

## Development

Commands (run from the project root):

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Typecheck and produce the production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the test suite once. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run typecheck` | TypeScript check only. |
| `npm run verify` | Typecheck, tests, and build in one pass. |

The stack is Vite, React, and TypeScript, with fflate for zip handling and lucide-react for icons. Tests use Vitest with Testing Library and fake-indexeddb. The bundled engine lives in `public/openbor-wasm`; see the manually modified files there and in `src/lib/playtest.ts` for how a project zip reaches the engine.

The app is deployed with GitHub Actions on every push to `master`. The workflow runs `npm ci`, `npm run build`, and publishes `dist/` to GitHub Pages. The Pages source in the repository settings must be set to GitHub Actions for the deploy to succeed.
