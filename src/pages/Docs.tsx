import { BookOpen, ExternalLink, Info, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FIELD_BY_KEY, FIELD_SECTIONS } from '../core/fields';
import { Badge, Card, PageHeader } from '../components/ui';
import type { HeaderFieldSpec } from '../core/types';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'projects', label: 'Projects & import' },
  { id: 'editing', label: 'Editing entities' },
  { id: 'levels', label: 'Levels & playtest' },
  { id: 'manifest', label: 'models.txt' },
  { id: 'compare', label: 'Compare & validation' },
  { id: 'git', label: 'Git terminal' },
  { id: 'backup', label: 'Backup & data' },
  { id: 'formats', label: 'Supported formats' },
  { id: 'fields', label: 'Header field reference' },
  { id: 'animations', label: 'Animation & frame syntax' },
  { id: 'validation', label: 'Validation' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'limits', label: 'Limitations' },
  { id: 'credits', label: 'Credits & sources' },
];

export function Docs() {
  const [fieldSearch, setFieldSearch] = useState('');
  const term = fieldSearch.trim().toLowerCase();
  const fieldSections = useMemo(
    () =>
      FIELD_SECTIONS.map((section) => ({
        section,
        fields: [...FIELD_BY_KEY.values()].filter(
          (field) =>
            field.section === section &&
            (!term ||
              field.key.toLowerCase().includes(term) ||
              field.label.toLowerCase().includes(term) ||
              field.summary.toLowerCase().includes(term)),
        ),
      })).filter((entry) => entry.fields.length > 0),
    [term],
  );

  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Documentation"
        subtitle="What OpenBOR Stats parses, how edits are written back, which engine semantics are used, and what the app deliberately does not do."
      />
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation sections">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#/docs#${section.id}`} onClick={(event) => {
              event.preventDefault();
              document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              {section.label}
            </a>
          ))}
        </nav>
        <div className="docs-body">
          <section className="docs-section" id="overview">
            <h2>Overview</h2>
            <p>
              OpenBOR Workbench is a local-first web editor for the text files that define OpenBOR models.
              It is a browser implementation of the statistics and entity-editing purpose of the original
              Windows application <strong>OpenBOR Stats</strong> (also known as openBor Stats) by MatMan,
              whose source is published by the OpenBOR project.
            </p>
            <p>
              The original tool parsed entity files, counted animation frames, delays, damage, and separate
              hits, exposed header fields in a grid, and provided entity editing, text editing, formatting,
              stage design, MUGEN import, PAK import, and other Windows-only tools. This web version focuses
              on the entity statistics and editing core: import, inspect, validate, compare, edit, and export
              model files without losing comments, scripts, unknown commands, indentation, or line endings.
            </p>
            <div className="callout">
              <Info size={14} />
              <span>
                <strong>Local-first:</strong> projects are stored in this browser's IndexedDB. There is no
                account, server, upload, or telemetry. Imported files are parsed in the page.
              </span>
            </div>
            <h3>What is preserved</h3>
            <ul>
              <li>Original line order, indentation, blank lines, tabs/spaces, and CRLF/LF line endings.</li>
              <li>Inline comments and standalone comment lines.</li>
              <li>Script blocks, @cmd lines, and unsupported/unknown commands.</li>
              <li>Every argument of a field that you do not edit.</li>
            </ul>
            <h3>What is derived</h3>
            <ul>
              <li>Header fields and their line numbers.</li>
              <li>Animation blocks, frame counts, effective delays, offsets, boxes, and movement.</li>
              <li>Attack windows, damage totals, separate hits, max hit, and animation duration.</li>
              <li>Validation findings and differences between entities or revisions.</li>
            </ul>
          </section>

          <section className="docs-section" id="getting-started">
            <h2>Getting started</h2>
            <ol>
              <li>Open <strong>Projects</strong> and create a project, or use <strong>Import</strong> in the top bar.</li>
              <li>Choose a mod folder (for example <span className="mono">mygame/data</span>) or individual <span className="mono">.txt</span> files.</li>
              <li>Review the import summary, then confirm. Models and levels are parsed in the page and stored in this browser.</li>
              <li>Open <strong>Entities</strong> to browse characters, enemies, weapons and other models, then open one in the <strong>Editor</strong>.</li>
              <li>Check <strong>Validation</strong>, save your work, and export the files when you are done.</li>
            </ol>
            <p>
              The sidebar lists every workspace: Dashboard, Projects, Entities, Editor, models.txt, Compare,
              Validation, Git, Documentation and Settings. The project switcher at the top of the sidebar changes
              the active project.
            </p>
          </section>

          <section className="docs-section" id="projects">
            <h2>Projects and import</h2>
            <p>
              A project is a named collection of imported files. You can keep several projects, for example one
              per mod or one per revision of the same mod, and switch between them at any time.
            </p>
            <h3>Importing</h3>
            <ul>
              <li><strong>Folder:</strong> pick a folder and every <span className="mono">.txt</span> file inside it, including nested subfolders, is read.</li>
              <li><strong>Files:</strong> pick one or more <span className="mono">.txt</span> files directly.</li>
              <li><strong>Drag and drop:</strong> drop a folder or files onto the import dialog.</li>
              <li>
                Limits: 2 MB per text file, 1 GB total, and 20,000 files per import. Files beyond these limits are
                reported and skipped.
              </li>
              <li>
                Images, sounds and scripts are not stored. Their paths are indexed so that validation can report
                missing frame images or icons.
              </li>
            </ul>
            <h3>Managing projects</h3>
            <ul>
              <li>Create, duplicate or delete a project from the <strong>Projects</strong> page.</li>
              <li>Each project shows its entity counts (characters, enemies, weapons, levels and so on).</li>
            </ul>
          </section>

          <section className="docs-section" id="editing">
            <h2>Editing entities</h2>
            <p>
              Open an entity from <strong>Entities</strong> or from a search result. The <strong>Editor</strong> has
              several tabs that all edit the same underlying text.
            </p>
            <ul>
              <li><strong>Frames:</strong> the animation blocks and their frames. Select a frame to edit its offset, body box, attack boxes, delay and movement.</li>
              <li><strong>Overview:</strong> the key stats of the model (health, speed, damage, animation durations).</li>
              <li><strong>Header lines:</strong> the header commands as structured fields. Fields you have not set show their engine default or a template you can add. Commands the structured editor does not cover stay in the file as text.</li>
              <li><strong>Validation:</strong> findings for the current draft, including unsaved changes.</li>
              <li><strong>History:</strong> saved revisions of the entity, which you can compare with the current text.</li>
            </ul>
            <h3>Saving and undo</h3>
            <ul>
              <li>Edits are kept as a draft until you save. Press <span className="kbd">Ctrl</span> + <span className="kbd">S</span> (or <span className="kbd">Cmd</span> + <span className="kbd">S</span>) to save.</li>
              <li>Press <span className="kbd">Ctrl</span> + <span className="kbd">Z</span> to undo and <span className="kbd">Ctrl</span> + <span className="kbd">Shift</span> + <span className="kbd">Z</span> to redo, unless the cursor is in a text box.</li>
              <li>Each save records a revision, so you can compare or go back to an earlier version.</li>
            </ul>
            <h3>Sprite preview</h3>
            <p>
              Where the referenced image is available from the imported files, the animation can be previewed frame
              by frame with play, pause and step controls.
            </p>
          </section>

          <section className="docs-section" id="levels">
            <h2>Levels and playtest</h2>
            <p>
              Level <span className="mono">.txt</span> files are imported and listed under <strong>Levels</strong>. They
              are edited as text, and the level tab offers structured controls for common settings:
            </p>
            <ul>
              <li>Music, boss music, background, front panel and panel images.</li>
              <li>Walls and holes: add, remove and change their values.</li>
              <li>Spawn points and their coordinates, and the level order.</li>
            </ul>
            <p>
              <strong>Play in browser</strong> (available from the Editor and the Entities page) packs the project
              into a zip and starts the bundled OpenBOR WebAssembly build in a new tab, so you can test a model or
              level without installing the engine. Use a project whose files are complete, and check the browser
              console if the game does not start. Playtest depends on the engine and on your assets, so validation
              passing does not guarantee that the game will run it.
            </p>
          </section>

          <section className="docs-section" id="manifest">
            <h2>models.txt</h2>
            <p>
              The <strong>models.txt</strong> page manages the file that tells OpenBOR which models to load. It can:
            </p>
            <ul>
              <li>Read an existing <span className="mono">models.txt</span> from the import, including <span className="mono">load</span> and <span className="mono">know</span> lines and comments.</li>
              <li>Generate <span className="mono">load</span> lines from the entities in the project.</li>
              <li>Report duplicate names and references to entities that are not in the project.</li>
              <li>Download the edited file with <strong>Download</strong>. Comments and non-load lines are kept.</li>
            </ul>
          </section>

          <section className="docs-section" id="compare">
            <h2>Compare and validation</h2>
            <h3>Compare</h3>
            <p>
              <strong>Compare</strong> shows two entities, or two saved revisions of one entity, side by side. Differences
              in header fields and frame data show what changed in balance, timing or boxes.
            </p>
            <h3>Validation</h3>
            <p>
              The <strong>Validation</strong> page checks the saved files of the whole project and lists errors, warnings
              and information, filterable by severity and by entity. Each finding gives a code, the line or animation
              when known, and a fix suggestion where one exists. Use <strong>Download report</strong> to save the results
              as a Markdown file.
            </p>
            <p>See the Validation section below for the full list of checks.</p>
          </section>

          <section className="docs-section" id="git">
            <h2>Git terminal</h2>
            <p>
              The <strong>Git</strong> page is a small terminal for keeping a mod in a GitHub repository, working
              entirely in this browser.
            </p>
            <ul>
              <li><strong>Clone:</strong> paste a repository URL and press Clone, or type <span className="mono">clone &lt;url&gt;</span>.</li>
              <li><strong>Commands:</strong> <span className="mono">status</span>, <span className="mono">add -A</span>, <span className="mono">commit -m "message"</span>, <span className="mono">pull</span>, <span className="mono">push</span>, <span className="mono">log</span>. Quick buttons cover the common ones.</li>
              <li><strong>History:</strong> press the Up and Down arrows in the terminal to reuse earlier commands.</li>
              <li><strong>Repositories:</strong> cloned repositories are kept in this browser and can be selected from the list.</li>
              <li><strong>Token:</strong> pulls and clones of public repositories work without a token. Push needs a personal access token, which is saved only in this browser. Use a fine-grained token limited to the repository, and remove it when you are done.</li>
            </ul>
            <div className="callout">
              <Info size={14} />
              <span>
                Git hosts do not allow browser requests directly, so traffic goes through a public CORS proxy, which can
                see the requests and the token. Do not use a token with access to repositories you do not want exposed.
              </span>
            </div>
          </section>

          <section className="docs-section" id="backup">
            <h2>Backup, export and data</h2>
            <ul>
              <li><strong>Export files:</strong> writes the edited <span className="mono">.txt</span> files back out, keeping comments, scripts, spacing and unknown commands.</li>
              <li><strong>Project bundle:</strong> a JSON file with one project, including its saved revisions and notes. Use it to move a single project to another browser.</li>
              <li><strong>Export all projects (Settings):</strong> writes every project to one JSON backup file. Backups include project text, summaries, revisions, asset path indexes and settings.</li>
              <li><strong>Merge projects or Replace all (Settings):</strong> importing a backup either keeps your current projects and adds the backup's projects, renaming duplicates, or removes the current projects and settings first.</li>
              <li><strong>Clear all local data (Settings):</strong> deletes every project, draft and setting in this browser. It cannot be undone, so export a backup first. Downloaded .txt files are not affected.</li>
            </ul>
          </section>

          <section className="docs-section" id="formats">
            <h2>Supported formats</h2>
            <div className="doc-field">
              <h4>OpenBOR model / entity .txt</h4>
              <p>
                Supported as the primary format. A model is recognised by a <code>name</code> header and/or
                animation blocks. The editor understands documented header commands, <code>anim</code> blocks,
                <code>frame</code> lines, <code>delay</code>, <code>offset</code>, <code>bbox</code>,
                <code>move</code>/<code>movez</code>/<code>movea</code>, <code>loop</code>,
                <code>range</code>/<code>rangea</code>, and legacy attack-box commands.
              </p>
            </div>
            <div className="doc-field">
              <h4>models.txt</h4>
              <p>
                Parsed and editable. Both <code>load</code> and <code>know</code> entries are recognised,
                including comments. The manifest editor can generate load lines from imported entities,
                detect duplicate names, and detect references to entities that are not in the project.
              </p>
            </div>
            <div className="doc-field">
              <h4>Images, audio, scripts, and fonts</h4>
              <p>
                Not stored. When you import a folder, their paths are indexed so validation can warn about
                frame images or icons that are referenced but not present. The app never executes scripts,
                images, or audio.
              </p>
            </div>
            <div className="doc-field">
              <h4>Not supported</h4>
              <p>
                PAK extraction, MUGEN character conversion, test-package generation, and the original
                level/HUD designers are outside this version. Level .txt files are detected during import and
                listed under Levels, and they are not treated as models.
              </p>
            </div>
          </section>

          <section className="docs-section" id="fields">
            <h2>Header field reference</h2>
            <p>
              These are the documented model header commands exposed by the structured editor. Commands that
              are not listed are preserved and remain editable in <strong>Header lines</strong> and{' '}
              <strong>Raw text</strong>. A field marked as having an engine default can be removed to fall
              back to that default; other values are templates shown before you add a field.
            </p>
            <div className="search-field" style={{ maxWidth: 380, marginBottom: 12 }}>
              <Search aria-hidden="true" />
              <input
                className="input"
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="Search fields by name or description…"
                aria-label="Search header fields"
              />
            </div>
            {fieldSections.length === 0 ? (
              <div className="muted small">No fields match "{fieldSearch}".</div>
            ) : (
              fieldSections.map(({ section, fields }) => (
                <div key={section} style={{ marginBottom: 18 }}>
                  <h3>{section}</h3>
                  {fields.map((field) => (
                    <FieldDoc key={field.key} field={field} />
                  ))}
                </div>
              ))
            )}
          </section>

          <section className="docs-section" id="animations">
            <h2>Animation and frame syntax</h2>
            <p>
              OpenBOR reads an animation block from top to bottom. Commands set pending properties, and a{' '}
              <code>frame</code> command creates a frame using the properties in effect at that point.
              Properties persist across later frames until changed. The editor reflects these effective
              values and only writes an override into the current frame's command segment, so inherited
              values are not silently rewritten.
            </p>
            <div className="code-block">{`anim attack1
  loop 0
  delay 8
  offset 32 96
  bbox 0 0 40 72
  attack 45 30 28 16 10 0 0 0 0 3
  frame data/chars/example/attack_01.png

  delay 5
  attack 0 0 0 0 0
  frame data/chars/example/attack_02.png`}</div>
            <h3>Legacy attack-box parameter order</h3>
            <p>
              OpenBOR Stats uses the engine's legacy attack shorthand. The order is:
            </p>
            <div className="code-block">{`attack[N]  x y width height damage [drop] [no_block] [no_flash] [pause] [z]
shock     x y width height damage [drop] [no_block] [no_flash] [pause] [z]
burn      x y width height damage [drop] [no_block] [no_flash] [pause] [z]
steal     x y width height damage [drop] [no_block] [no_flash] [pause] [z]
blast     x y width height damage [no_block] [no_flash] [pause] [z]
freeze    x y width height damage [freeze_time] [no_block] [no_flash] [pause] [z]`}</div>
            <p>
              The sixth attack value is <strong>drop/knockdown</strong> in the engine, not a generic "power"
              value. The original application labelled it as power; this implementation follows the engine
              parser and labels it drop (or freeze time for a freeze box). Values cannot be skipped: supply
              earlier optional values to reach a later one.
            </p>
            <h3>Body boxes</h3>
            <p>
              <code>bbox x y width height [z]</code> defines the body box for the upcoming frame. The
              inspector can add, edit, or disable it. <code>bboxz</code> changes depth independently.
            </p>
            <h3>Timing</h3>
            <p>
              Delays use OpenBOR's centisecond units. The app sums effective delays and reports seconds by
              dividing by 100. It does not apply an <code>edelay</code> adjustment, so duration is the raw
              animation timing.
            </p>
            <h3>Damage and hits</h3>
            <p>
              Each contiguous attack window contributes its damage once, and the number of windows is the
              separate-hit count. This mirrors the original OpenBOR Stats calculation and avoids counting
              every frame of a persistent box as a new hit.
            </p>
          </section>

          <section className="docs-section" id="validation">
            <h2>Validation</h2>
            <p>
              Validation is split into errors, warnings, and information. Errors cover things such as a
              missing name, unknown entity type, no animations, malformed attack-box arguments, and broken
              models.txt references. Warnings cover documented ranges, missing idle bodies, duplicate fields,
              large or negative values, and asset references not found in imported paths. Information notes
              behaviour such as <code>frame none</code> or negative delays.
            </p>
            <ul>
              <li>Validation runs on the <strong>saved project text</strong> in the Validation workspace.</li>
              <li>The editor's Validation tab runs on the <strong>current draft</strong>, including unsaved changes.</li>
              <li>Unknown header commands are reported as "not in the validation catalog" but are never discarded.</li>
              <li>Asset-reference checks only run when paths were indexed by importing files/folders.</li>
              <li>Every finding includes a code, line or animation context when available, and a fix suggestion where one is known.</li>
            </ul>
            <div className="callout">
              <Info size={14} />
              <span>
                Validation cannot guarantee that OpenBOR will accept a file. Engine versions differ, custom
                commands exist, and runtime behaviour depends on assets and scripts. Always test exported files
                in your target OpenBOR build.
              </span>
            </div>
          </section>

          <section className="docs-section" id="shortcuts">
            <h2>Keyboard shortcuts</h2>
            <ul>
              <li><span className="kbd">Ctrl</span> + <span className="kbd">S</span> — save the current entity.</li>
              <li><span className="kbd">Ctrl</span> + <span className="kbd">Z</span> — undo the last structured or raw edit (outside a text input).</li>
              <li><span className="kbd">Ctrl</span> + <span className="kbd">Shift</span> + <span className="kbd">Z</span> — redo.</li>
              <li><span className="kbd">Esc</span> — close a dialog.</li>
              <li>Native text undo continues to work while typing in inputs and the raw editor.</li>
            </ul>
          </section>

          <section className="docs-section" id="limits">
            <h2>Limitations</h2>
            <ul>
              <li>Level files are edited as text, with a set of structured controls. PAK archives are not supported.</li>
              <li>Sprite, sound, and script files are indexed by path only. The app does not preview sprites or run scripts.</li>
              <li>Structured editing covers the documented header fields and common frame properties; structural animation creation and bulk frame operations use the raw editor.</li>
              <li>The app does not recreate the original Windows tools: Test Factory, Level Designer, HUD Designer, Wall Calculator, Format Factory, PAK import, or MUGEN import.</li>
              <li>Import limits: 2 MB per text file, 1 GB total, and 20,000 files per import. Oversized or unsupported files are reported and skipped.</li>
              <li>All projects live in one browser profile. Clearing site data, using private browsing, or changing browsers can remove them. Export project bundles and .txt files for backup.</li>
              <li>Export is intentionally textual and preserves unknown data, but compatibility with a specific OpenBOR build has not been verified by running that build inside this app.</li>
            </ul>
          </section>

          <section className="docs-section" id="credits">
            <h2>Credits and sources</h2>
            <p>
              The original OpenBOR Stats was created by MatMan for the OpenBOR community. This web
              implementation preserves its entity-statistics purpose and is not affiliated with the original
              author.
            </p>
            <ul>
              <li>
                <a href="https://github.com/OpenBOR/OpenBORStats" target="_blank" rel="noreferrer">
                  OpenBOR/OpenBORStats source <ExternalLink size={11} style={{ display: 'inline' }} />
                </a>{' '}
                — original Delphi application, header configuration, and history.
              </li>
              <li>
                <a href="https://github.com/OpenBOR/OpenBOR" target="_blank" rel="noreferrer">
                  OpenBOR engine source <ExternalLink size={11} style={{ display: 'inline' }} />
                </a>{' '}
                — command parsing, default values, attack-box arguments, and entity types.
              </li>
              <li>
                <a href="https://chronocrash.com/openbor/wiki/index.php/Legacy_Manual" target="_blank" rel="noreferrer">
                  ChronoCrash OpenBOR wiki / legacy manual <ExternalLink size={11} style={{ display: 'inline' }} />
                </a>{' '}
                — documented header semantics, ranges, and animation commands.
              </li>
            </ul>
            <p className="small muted">
              No OpenBOR engine code is bundled or executed. The parser is an independent TypeScript
              implementation built from the documented text syntax and engine source behaviour.
            </p>
          </section>

          <Card>
            <div className="card-body row" style={{ gap: 9 }}>
              <BookOpen size={16} className="text-accent" />
              <span className="small muted">
                This documentation is part of the app and can be read offline. Field definitions are generated
                from the same catalog used by the editor and validator.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function FieldDoc({ field }: { field: HeaderFieldSpec }) {
  return (
    <div className="doc-field">
      <h4>{field.key}</h4>
      <p>{field.summary}</p>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="syntax">
          {field.key}
          {field.args.map((arg) => ` <${arg.name}>`).join('')}
        </span>
        {field.repeatable ? <Badge tone="neutral">repeatable</Badge> : null}
        {field.deprecated ? <Badge tone="warning">legacy</Badge> : null}
        {field.engineDefault !== undefined ? (
          <Badge tone="success">engine default: {field.engineDefault}</Badge>
        ) : (
          <Badge tone="neutral">no documented default</Badge>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 5 }}>
        Arguments: {field.args.map((arg) => `${arg.name} (${arg.kind}${arg.options ? `: ${arg.options.join('|')}` : ''}${arg.optional ? ', optional' : ''})`).join(', ')}
      </p>
    </div>
  );
}
