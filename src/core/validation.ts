import { FIELD_BY_KEY, KNOWN_MODEL_COMMANDS, SUBTYPE_OPTIONS, TYPE_OPTIONS } from './fields';
import { findMissingManifestEntities, normalizeAssetPath, parseModelsManifest } from './modelsManifest';
import { isLevelModel, parseModel } from './parser';
import type {
  HeaderFieldSpec,
  ParsedModel,
  Project,
  ProjectEntity,
  ValidationFinding,
} from './types';

export interface ValidationContext {
  assetPaths?: string[];
  modelNames?: string[];
}

const KNOWN_SET = new Set(KNOWN_MODEL_COMMANDS.map((command) => command.toLowerCase()));
const REPEATABLE = new Set(['load', 'remap']);

function finding(
  severity: ValidationFinding['severity'],
  code: string,
  message: string,
  extra: Partial<ValidationFinding> = {},
): ValidationFinding {
  return { severity, code, message, ...extra };
}

function validateHeaderEntry(
  model: ParsedModel,
  spec: HeaderFieldSpec,
  entryIndex: number,
  findings: ValidationFinding[],
): void {
  const entry = model.header.filter((candidate) => candidate.key === spec.key)[entryIndex];
  if (!entry) return;
  const line = entry.line + 1;
  const requiredCount = spec.args.filter((arg, index) => {
    if (arg.optional) return false;
    // Arguments after the first optional argument are also optional.
    return !spec.args.slice(0, index).some((candidate) => candidate.optional);
  }).length;
  if (entry.args.length < requiredCount) {
    findings.push(
      finding(
        'error',
        'FIELD_ARGS',
        `${spec.key} expects ${requiredCount} value${requiredCount === 1 ? '' : 's'} but has ${entry.args.length}.`,
        {
          line,
          detail: spec.summary,
          fix: `Supply the missing values, or remove the ${spec.key} line to use the engine default.`,
        },
      ),
    );
    return;
  }
  if (!spec.repeatable && entry.args.length > spec.args.length) {
    findings.push(
      finding(
        'warning',
        'FIELD_EXTRA_ARGS',
        `${spec.key} has ${entry.args.length - spec.args.length} extra argument(s). They are preserved but not validated.`,
        { line },
      ),
    );
  }
  spec.args.forEach((arg, index) => {
    const value = entry.args[index];
    if (value === undefined || value === '') return;
    if (arg.kind === 'integer' || arg.kind === 'float') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        findings.push(
          finding('error', 'FIELD_NUMBER', `${spec.key} ${arg.name} must be a number, not "${value}".`, {
            line,
            fix: 'Enter a numeric value.',
          }),
        );
        return;
      }
      if (arg.kind === 'integer' && !Number.isInteger(numeric)) {
        findings.push(
          finding(
            'warning',
            'FIELD_INTEGER',
            `${spec.key} ${arg.name} is read as an integer by the engine; the decimal part of "${value}" is ignored.`,
            { line },
          ),
        );
      }
      if (arg.min !== undefined && numeric < arg.min) {
        findings.push(
          finding(
            'warning',
            'FIELD_RANGE',
            `${spec.key} ${arg.name} is ${numeric}, below the documented minimum ${arg.min}.`,
            { line, fix: `Use ${arg.min} or higher, or remove the line to use the engine default.` },
          ),
        );
      }
      if (arg.max !== undefined && numeric > arg.max) {
        findings.push(
          finding(
            'warning',
            'FIELD_RANGE',
            `${spec.key} ${arg.name} is ${numeric}, above the documented maximum ${arg.max}.`,
            { line, fix: `Use ${arg.max} or lower.` },
          ),
        );
      }
    }
    if (arg.options && !arg.options.some((option) => option.toLowerCase() === value.toLowerCase())) {
      findings.push(
        finding(
          'warning',
          'FIELD_OPTION',
          `${spec.key} ${arg.name} value "${value}" is not in the documented set (${arg.options.join(', ')}).`,
          { line },
        ),
      );
    }
  });
}

export function validateModel(model: ParsedModel, context: ValidationContext = {}): ValidationFinding[] {
  // Levels are browsable and editable as text, but the model rules do not apply to them.
  if (isLevelModel(model)) return [];
  const findings: ValidationFinding[] = [];
  const type = model.type?.toLowerCase() ?? null;
  const isCharacter = type === 'player' || type === 'enemy' || type === 'npc';

  if (!model.name) {
    findings.push(
      finding('error', 'NAME_MISSING', 'The model has no name header, so models.txt cannot reference it.', {
        fix: 'Add a line such as "name my_character" near the top of the file.',
      }),
    );
  } else if (/\s/.test(model.name)) {
    findings.push(
      finding('warning', 'NAME_SPACE', `Model name "${model.name}" contains whitespace.`, {
        line: model.header.find((entry) => entry.key === 'name')!.line + 1,
        fix: 'Use underscores instead of spaces; the engine tokenises names on whitespace.',
      }),
    );
  }
  if (!type) {
    findings.push(
      finding('warning', 'TYPE_MISSING', 'No type is declared. The engine falls back to type none.', {
        fix: 'Add "type enemy", "type player", or another supported type.',
      }),
    );
  } else if (!TYPE_OPTIONS.includes(type)) {
    findings.push(
      finding('error', 'TYPE_INVALID', `Unknown entity type "${model.type}".`, {
        line: model.header.find((entry) => entry.key === 'type')!.line + 1,
        fix: `Use one of: ${TYPE_OPTIONS.join(', ')}.`,
      }),
    );
  }
  if (model.subtype && !SUBTYPE_OPTIONS.includes(model.subtype.toLowerCase())) {
    findings.push(
      finding('warning', 'SUBTYPE_INVALID', `Subtype "${model.subtype}" is not in the documented set.`, {
        fix: `Documented values: ${SUBTYPE_OPTIONS.join(', ')}.`,
      }),
    );
  }

  // Header field validation for documented fields.
  for (const [key, spec] of FIELD_BY_KEY) {
    const count = model.header.filter((entry) => entry.key === key).length;
    if (count === 0) continue;
    if (!spec.repeatable && count > 1) {
      findings.push(
        finding(
          'warning',
          'FIELD_DUPLICATE',
          `${key} appears ${count} times. The engine applies the last occurrence.`,
          { line: model.header.find((entry) => entry.key === key)!.line + 1 },
        ),
      );
    }
    for (let index = 0; index < count; index += 1) validateHeaderEntry(model, spec, index, findings);
  }

  // Unknown header commands are preserved, but callers should know they were not checked.
  const suspiciousRepeats = new Set<string>();
  for (const entry of model.header) {
    if (!KNOWN_SET.has(entry.key) && !entry.key.startsWith('@')) {
      findings.push(
        finding(
          'warning',
          'FIELD_UNKNOWN',
          `"${entry.key}" is not in the validation catalog. It is preserved in exports and left untouched.`,
          {
            line: entry.line + 1,
            detail: entry.raw.trim(),
          },
        ),
      );
    }
    if (!REPEATABLE.has(entry.key) && !FIELD_BY_KEY.has(entry.key) && suspiciousRepeats.has(entry.key)) {
      findings.push(
        finding('info', 'FIELD_REPEATED', `"${entry.key}" is repeated in the header.`, {
          line: entry.line + 1,
        }),
      );
    }
    suspiciousRepeats.add(entry.key);
  }

  const health = Number(model.header.find((entry) => entry.key === 'health')?.args[0]);
  if (isCharacter) {
    if (!model.header.some((entry) => entry.key === 'health')) {
      findings.push(
        finding('error', 'HEALTH_MISSING', 'Characters without a health header start with 0 health and die immediately.', {
          fix: 'Add a health value, for example "health 100".',
        }),
      );
    } else if (!Number.isFinite(health) || health <= 0) {
      findings.push(
        finding('error', 'HEALTH_ZERO', `Health is ${Number.isFinite(health) ? health : 'invalid'}; the entity will start dead.`, {
          fix: 'Use a positive health value.',
        }),
      );
    }
  }
  const speedEntry = model.header.find((entry) => entry.key === 'speed');
  if (speedEntry) {
    const speed = Number(speedEntry.args[0]);
    if (Number.isFinite(speed) && speed >= 5 && speed <= 300) {
      // in range
    } else {
      findings.push(
        finding('warning', 'SPEED_RANGE', 'The engine clamps walking speed to the 5–300 range.', {
          line: speedEntry.line + 1,
          fix: 'Use speedf for speeds outside this range or fractional values.',
        }),
      );
    }
  }
  const grab = model.header.find((entry) => entry.key === 'grabdistance');
  if (grab) {
    const value = Number(grab.args[0]);
    if (Number.isFinite(value) && value <= 0) {
      findings.push(
        finding('warning', 'GRAB_DISTANCE', 'A non-positive grab distance prevents grabbing.', {
          line: grab.line + 1,
        }),
      );
    }
  }
  const chain = model.header.find((entry) => entry.key === 'atchain');
  if (chain) {
    if (chain.args.length > 12) {
      findings.push(
        finding('warning', 'ATCHAIN_LENGTH', 'atchain supports at most 12 entries.', {
          line: chain.line + 1,
        }),
      );
    }
    chain.args.forEach((value) => {
      const attack = Number(value);
      if (!Number.isFinite(attack) || attack < 0 || attack > 20) {
        findings.push(
          finding('warning', 'ATCHAIN_RANGE', `atchain entry "${value}" is outside the usual attack range 0–20.`, {
            line: chain.line + 1,
          }),
        );
      }
    });
  }
  const running = model.header.find((entry) => entry.key === 'running');
  if (running && isCharacter && !model.animations.some((animation) => animation.name.toLowerCase() === 'run')) {
    findings.push(
      finding('warning', 'RUNNING_NO_RUN', 'running is configured but the model has no RUN animation.', {
        line: running.line + 1,
      }),
    );
  }

  if (model.animations.length === 0) {
    findings.push(
      finding('error', 'ANIM_MISSING', 'The model has no animation blocks. OpenBOR models need at least an idle or spawn animation.', {
        fix: 'Add an animation block beginning with "anim idle".',
      }),
    );
  }
  if (isCharacter && !model.animations.some((animation) => animation.name.toLowerCase() === 'idle')) {
    findings.push(
      finding('warning', 'IDLE_MISSING', 'No IDLE animation was found. The engine may fail to display the entity correctly.', {
        fix: 'Add an animation block named idle.',
      }),
    );
  }

  for (const animation of model.animations) {
    if (animation.frames.length === 0) {
      findings.push(
        finding('warning', 'ANIM_EMPTY', `Animation "${animation.name}" has no frames.`, {
          line: animation.line + 1,
        }),
      );
    }
    if (animation.loop) {
      if (animation.loop[0] !== 0 && animation.loop[0] !== 1) {
        findings.push(
          finding('warning', 'LOOP_FLAG', `Animation "${animation.name}" loop flag is ${animation.loop[0]}; use 0 or 1.`, {
            line: (animation.loopLine ?? animation.line) + 1,
          }),
        );
      }
      if (animation.frames.length > 0 && animation.loop[1] >= animation.frames.length) {
        findings.push(
          finding('warning', 'LOOP_FRAME', `Animation "${animation.name}" loops to frame ${animation.loop[1]}, but it has ${animation.frames.length} frame(s).`, {
            line: (animation.loopLine ?? animation.line) + 1,
          }),
        );
      }
    }
    for (const frame of animation.frames) {
      if (!frame.image) {
        findings.push(
          finding('info', 'FRAME_NONE', `Animation "${animation.name}" frame ${frame.number} has no sprite (frame none).`, {
            line: frame.line + 1,
            animation: animation.name,
            frame: frame.number,
          }),
        );
      }
      if (frame.bbox && (frame.bbox[2] <= 0 || frame.bbox[3] <= 0)) {
        findings.push(
          finding(
            'warning',
            'BBOX_SIZE',
            `Animation "${animation.name}" frame ${frame.number} has a body box with width ${frame.bbox[2]} and height ${frame.bbox[3]}.`,
            {
              line: frame.line + 1,
              animation: animation.name,
              frame: frame.number,
              fix: 'Use positive width and height values, or an explicit disabled box.',
            },
          ),
        );
      }
      if (frame.attack) {
        if (frame.attack.short) {
          findings.push(
            finding(
              'error',
              'ATTACK_SHORT',
              `Animation "${animation.name}" frame ${frame.number} has an attack box with fewer than five numeric values (x y width height damage).`,
              {
                line: frame.attack.line + 1,
                animation: animation.name,
                frame: frame.number,
                fix: 'Supply x, y, width, height, and damage; optional values follow in engine order.',
              },
            ),
          );
        }
        if (frame.attack.width <= 0 || frame.attack.height <= 0) {
          findings.push(
            finding(
              'warning',
              'ATTACK_SIZE',
              `Animation "${animation.name}" frame ${frame.number} has an attack box with a non-positive size.`,
              { line: frame.attack.line + 1, animation: animation.name, frame: frame.number },
            ),
          );
        }
        if (frame.attack.damage < 0) {
          findings.push(
            finding(
              'warning',
              'ATTACK_DAMAGE',
              `Animation "${animation.name}" frame ${frame.number} has negative attack damage (${frame.attack.damage}).`,
              { line: frame.attack.line + 1, animation: animation.name, frame: frame.number },
            ),
          );
        }
      }
      if (frame.delay < 0) {
        findings.push(
          finding('info', 'DELAY_NEGATIVE', `Frame ${frame.number} in "${animation.name}" uses a negative delay. Modern OpenBOR treats negative delay as infinite.`, {
            line: frame.line + 1,
            animation: animation.name,
            frame: frame.number,
          }),
        );
      }
    }
    const bodyBoxes = animation.frames.filter((frame) => frame.bbox !== null).length;
    if (isCharacter && bodyBoxes === 0 && animation.frames.length > 0) {
      findings.push(
        finding('warning', 'BBOX_MISSING', `Animation "${animation.name}" defines no body box. The entity may be unhittable during this animation.`, {
          line: animation.line + 1,
          animation: animation.name,
        }),
      );
    }
    for (const frame of animation.frames) {
      for (const command of frame.commands) {
        if (command.key === 'bbox' && command.args.length < 4) {
          findings.push(
            finding('warning', 'BBOX_ARGS', `A bbox command in "${animation.name}" frame ${frame.number} has fewer than four values.`, {
              line: command.line + 1,
              animation: animation.name,
              frame: frame.number,
            }),
          );
        }
      }
    }
    for (const line of model.lines) {
      if (line.index >= animation.line && line.index < animation.endLine && line.command === 'frame' && line.args.length === 0) {
        findings.push(
          finding('warning', 'FRAME_ARGS', `A frame command in "${animation.name}" has no image path.`, {
            line: line.index + 1,
            animation: animation.name,
          }),
        );
      }
    }
  }

  // Duplicate animation names are reported by the parser too; keep one consistent code.
  const animNames = new Map<string, number>();
  for (const animation of model.animations) {
    const key = animation.name.toLowerCase();
    animNames.set(key, (animNames.get(key) ?? 0) + 1);
  }
  for (const [name, count] of animNames) {
    if (name && count > 1) {
      const first = model.animations.find((animation) => animation.name.toLowerCase() === name);
      findings.push(
        finding('warning', 'ANIM_DUPLICATE', `Animation "${first?.name}" appears ${count} times.`, {
          line: first ? first.line + 1 : undefined,
          fix: 'Duplicate animation slots can override each other; keep a single block per animation name.',
        }),
      );
    }
  }

  if (context.assetPaths && context.assetPaths.length > 0) {
    const assets = new Set(context.assetPaths.map(normalizeAssetPath));
    for (const animation of model.animations) {
      for (const frame of animation.frames) {
        if (!frame.image) continue;
        const normalized = normalizeAssetPath(frame.image);
        if (!assets.has(normalized)) {
          findings.push(
            finding(
              'warning',
              'FRAME_ASSET',
              `Frame image "${frame.image}" was not found among the imported project assets.`,
              {
                line: frame.line + 1,
                animation: animation.name,
                frame: frame.number,
                fix: 'Import the referenced image or correct the frame path.',
              },
            ),
          );
        }
      }
    }
    for (const key of ['icon', 'iconpain', 'icondie', 'iconget', 'iconw', 'diesound']) {
      for (const entry of model.header.filter((candidate) => candidate.key === key)) {
        const path = entry.args[0];
        if (path && !assets.has(normalizeAssetPath(path))) {
          findings.push(
            finding('warning', 'ASSET_MISSING', `${key} references "${path}", which was not found among the imported assets.`, {
              line: entry.line + 1,
            }),
          );
        }
      }
    }
  }

  if (context.modelNames) {
    const lower = (model.name ?? '').toLowerCase();
    if (lower && context.modelNames.filter((name) => name.toLowerCase() === lower).length > 1) {
      findings.push(
        finding('error', 'NAME_DUPLICATE_PROJECT', `Another entity in this project also uses the model name "${model.name}".`, {
          fix: 'Model names must be unique; rename one of the models.',
        }),
      );
    }
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings: ValidationFinding[]): ValidationFinding[] {
  const seen = new Set<string>();
  return findings.filter((item) => {
    const key = `${item.code}|${item.line ?? ''}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ProjectValidation {
  perEntity: Record<string, ValidationFinding[]>;
  project: ValidationFinding[];
  errors: number;
  warnings: number;
  infos: number;
}

export function validateProject(project: Project): ProjectValidation {
  const perEntity: Record<string, ValidationFinding[]> = {};
  const allNames = project.entities
    .map((entity) => entity.summary.name ?? '')
    .filter(Boolean);
  // Only check asset references when the project actually includes non-text assets.
  // A folder of .txt files is not enough to conclude that images are missing.
  const hasRealAssets = project.assetPaths.some((path) => !/\.txt$/i.test(path));
  const assets = hasRealAssets ? project.assetPaths : undefined;
  for (const entity of project.entities) {
    try {
      const model = parseModel(entity.raw);
      perEntity[entity.id] = validateModel(model, {
        assetPaths: assets,
        modelNames: allNames,
      });
    } catch (error) {
      perEntity[entity.id] = [
        finding('error', 'PARSE_CRASH', 'The file could not be parsed.', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      ];
    }
  }
  const projectFindings: ValidationFinding[] = [];
  const nameMap = new Map<string, ProjectEntity[]>();
  for (const entity of project.entities) {
    const name = entity.summary.name?.toLowerCase();
    if (!name) continue;
    nameMap.set(name, [...(nameMap.get(name) ?? []), entity]);
  }
  for (const [name, entities] of nameMap) {
    if (entities.length > 1) {
      projectFindings.push(
        finding('error', 'PROJECT_NAME_DUPLICATE', `Model name "${name}" is used by ${entities.length} entities.`, {
          detail: entities.map((entity) => entity.path).join(', '),
          fix: 'Open each entity and give it a unique name header.',
        }),
      );
    }
  }
  const pathMap = new Map<string, ProjectEntity[]>();
  for (const entity of project.entities) {
    const path = normalizeAssetPath(entity.path || entity.fileName);
    pathMap.set(path, [...(pathMap.get(path) ?? []), entity]);
  }
  for (const [path, entities] of pathMap) {
    if (entities.length > 1) {
      projectFindings.push(
        finding('warning', 'PROJECT_PATH_DUPLICATE', `${entities.length} entities share the file path "${path}".`, {
          fix: 'Give each imported file a unique path.',
        }),
      );
    }
  }
  if (project.modelsFile === null) {
    projectFindings.push(
      finding('warning', 'MANIFEST_MISSING', 'This project has no models.txt manifest. OpenBOR will not see these entities until they are registered.', {
        fix: 'Open the project manifest and generate it from the imported entities.',
      }),
    );
  } else {
    const parsed = parseModelsManifest(project.modelsFile);
    const missing = findMissingManifestEntities(parsed, project.entities);
    for (const entry of missing) {
      projectFindings.push(
        finding('error', 'MANIFEST_REF', `models.txt line ${entry.line} loads "${entry.name}" (${entry.path}), but that entity is not in the project.`, {
          fix: 'Import the missing model file, correct the path, or remove the load line.',
        }),
      );
    }
    for (const duplicate of parsed.duplicates) {
      projectFindings.push(
        finding('warning', 'MANIFEST_DUPLICATE', `models.txt registers "${duplicate}" more than once.`, {
          fix: 'Remove the duplicate load line.',
        }),
      );
    }
  }

  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const items of [...Object.values(perEntity), projectFindings]) {
    for (const item of items) {
      if (item.severity === 'error') errors += 1;
      else if (item.severity === 'warning') warnings += 1;
      else infos += 1;
    }
  }
  return { perEntity, project: projectFindings, errors, warnings, infos };
}
