import { FileCode2, Folder, Map as MapIcon, type LucideIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { isLevelModel, parseModel } from '../core/parser';
import type { ProjectEntity } from '../core/types';
import { resolveAssetUrl, useProjectAssets } from '../lib/assets';
import { typeLabel } from '../lib/format';
import { FrameThumb } from './SpritePreview';

const TYPE_ORDER = ['player', 'enemy', 'npc', 'item', 'obstacle', 'steamer', 'text'];
const PREFERRED_ANIMATIONS = ['idle', 'stand', 'walk'];

interface TreeRow {
  entity: ProjectEntity;
  level: boolean;
  image: string | null;
}

/** First frame image to use as an icon: idle/stand/walk first, then any animation. */
function representativeImage(raw: string): string | null {
  try {
    const model = parseModel(raw);
    const rank = (name: string) => {
      const index = PREFERRED_ANIMATIONS.indexOf(name.toLowerCase());
      return index === -1 ? PREFERRED_ANIMATIONS.length : index;
    };
    const ordered = [...model.animations].sort((a, b) => rank(a.name) - rank(b.name));
    for (const animation of ordered) {
      for (const frame of animation.frames) {
        if (frame.image) return frame.image;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function folderOf(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : 'levels';
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function TreeGroup({
  label,
  count,
  children,
  icon: Icon,
  defaultOpen = true,
}: {
  label: string;
  count: number;
  children: ReactNode;
  icon?: LucideIcon;
  defaultOpen?: boolean;
}) {
  return (
    <details className="tree-group" open={defaultOpen}>
      <summary className="tree-group-head">
        {Icon ? <Icon size={14} aria-hidden="true" /> : null}
        <span>{label}</span>
        <span className="tree-count mono">{count}</span>
      </summary>
      <div className="tree-group-body">{children}</div>
    </details>
  );
}

export function ProjectTree({
  entities,
  projectId,
  onOpen,
}: {
  entities: ProjectEntity[];
  projectId: string;
  onOpen: (entity: ProjectEntity) => void;
}) {
  const assets = useProjectAssets(projectId);

  const rows = useMemo<TreeRow[]>(
    () =>
      entities.map((entity) => {
        let level = false;
        try {
          level = isLevelModel(parseModel(entity.raw));
        } catch {
          level = false;
        }
        return { entity, level, image: representativeImage(entity.raw) };
      }),
    [entities],
  );

  const levels = rows.filter((row) => row.level);
  const models = rows.filter((row) => !row.level);
  const levelGroups = groupBy(levels, (row) => folderOf(row.entity.path));
  const typeGroups = groupBy(models, (row) => row.entity.summary.type ?? 'none').sort(([a], [b]) => {
    const rank = (type: string) => {
      const index = TYPE_ORDER.indexOf(type);
      return index === -1 ? TYPE_ORDER.length : index;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  const renderRow = (row: TreeRow) => {
    const url = assets && row.image ? resolveAssetUrl(assets, row.image) : null;
    const name = row.entity.summary.name ?? row.entity.fileName;
    return (
      <button
        key={row.entity.id}
        type="button"
        className="tree-row"
        onClick={() => onOpen(row.entity)}
        title={row.entity.path}
      >
        <span className="tree-icon" aria-hidden="true">
          {row.level ? <MapIcon size={16} /> : <FrameThumb url={url} width={28} height={28} />}
        </span>
        <span className="tree-name">{name}</span>
        <span className="tree-file mono">{row.entity.fileName}</span>
        <span className="tree-kind">{row.level ? 'level' : typeLabel(row.entity.summary.type)}</span>
      </button>
    );
  };

  return (
    <div className="project-tree" aria-label="Project tree">
      <TreeGroup label="Levels" count={levels.length} icon={MapIcon}>
        {levels.length === 0 ? (
          <div className="muted small tree-empty">No level files were imported.</div>
        ) : (
          levelGroups.map(([folder, items]) => (
            <TreeGroup key={folder} label={folder} count={items.length} icon={Folder} defaultOpen={false}>
              {items
                .sort((a, b) => a.entity.fileName.localeCompare(b.entity.fileName))
                .map(renderRow)}
            </TreeGroup>
          ))
        )}
      </TreeGroup>
      <TreeGroup label="Models" count={models.length} icon={FileCode2}>
        {typeGroups.length === 0 ? (
          <div className="muted small tree-empty">No model files were imported.</div>
        ) : (
          typeGroups.map(([type, items]) => (
            <TreeGroup key={type} label={type} count={items.length} icon={Folder}>
              {items
                .sort((a, b) =>
                  (a.entity.summary.name ?? a.entity.fileName).localeCompare(
                    b.entity.summary.name ?? b.entity.fileName,
                  ),
                )
                .map(renderRow)}
            </TreeGroup>
          ))
        )}
      </TreeGroup>
    </div>
  );
}
