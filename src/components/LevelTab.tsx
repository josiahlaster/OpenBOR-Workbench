import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseLevel,
  removePanel,
  removeSpawn,
  removeWall,
  addWall,
  setBackground,
  setMusic,
  setOrder,
  setPanelImage,
  setSpawnAt,
  setSpawnPosition,
  setWallValues,
  type LevelWall,
  type WallField,
} from '../core/level';
import { parseModel } from '../core/parser';
import { entityManifestPath, normalizeAssetPath, parseModelsManifest } from '../core/modelsManifest';
import type { Project } from '../core/types';
import { useApp } from '../state/AppStore';
import { loadKeyedSprite, resolveAssetUrl, useProjectAssets, type AssetUrlIndex } from '../lib/assets';
import { Button, Card } from './ui';

type Commit = (next: string, action: string) => void;

/** A text or number input that commits when it loses focus or Enter is pressed. */
function CommitInput({
  value,
  onCommit,
  type = 'text',
  width = 120,
}: {
  value: string;
  onCommit: (next: string) => void;
  type?: 'text' | 'number';
  width?: number;
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      type={type}
      className="mono"
      style={{ width, font: 'inherit', fontSize: 12 }}
      onBlur={(event) => {
        if (event.target.value !== value) onCommit(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}

/**
 * Loads the sprite for a spawn name. The name is matched to a models.txt entry, then to that
 * character's saved file, and the first frame of its idle (or first) animation is used.
 */
async function loadSpawnSprite(
  project: Project | null,
  assets: AssetUrlIndex | null,
  spawnName: string,
): Promise<HTMLCanvasElement | null> {
  if (!project || !assets) return null;
  const key = spawnName.toLowerCase();
  const entry = parseModelsManifest(project.modelsFile ?? '').entries.find(
    (item) => item.name.toLowerCase() === key,
  );
  const byPath = entry
    ? project.entities.find(
        (item) => normalizeAssetPath(entityManifestPath(item)) === normalizeAssetPath(entry.path),
      )
    : undefined;
  const entity =
    byPath ?? project.entities.find((item) => (item.summary.name ?? '').toLowerCase() === key);
  if (!entity) return null;
  const model = parseModel(entity.raw);
  const animation =
    model.animations.find(
      (item) => item.name.toLowerCase() === 'idle' && item.frames.some((frame) => frame.image),
    ) ?? model.animations.find((item) => item.frames.some((frame) => frame.image));
  const url = resolveAssetUrl(assets, animation?.frames.find((frame) => frame.image)?.image);
  if (!url) return null;
  try {
    return await loadKeyedSprite(url);
  } catch {
    return null;
  }
}

/** Layers the original Level Designer toggles above its preview, in the same order. */
type LayerKey = 'background' | 'panels' | 'entities' | 'front' | 'holes';
const LAYER_LABELS: [LayerKey, string][] = [
  ['background', 'Background'],
  ['panels', 'Panels'],
  ['entities', 'Entities'],
  ['front', 'Front'],
  ['holes', 'Holes/Walls'],
];
const LAYER_DEFAULTS: Record<LayerKey, boolean> = {
  background: true,
  panels: true,
  entities: true,
  front: true,
  holes: true,
};

function ScenePreview({ raw, projectId }: { raw: string; projectId: string }) {
  const scene = useMemo(() => parseLevel(raw), [raw]);
  const project = useApp().activeProject;
  const assets = useProjectAssets(projectId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(LAYER_DEFAULTS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const panelByLetter = new Map(scene.panels.map((panel) => [panel.letter, panel]));
    const letters = scene.order
      .toUpperCase()
      .split('')
      .filter((letter) => panelByLetter.has(letter));

    const draw = async () => {
      const placed: { image: HTMLCanvasElement | null; x: number }[] = [];
      let x = 0;
      for (const letter of letters) {
        const panel = panelByLetter.get(letter);
        const url = panel && assets ? resolveAssetUrl(assets, panel.image) : null;
        let image: HTMLCanvasElement | null = null;
        if (url) {
          try {
            image = await loadKeyedSprite(url);
          } catch {
            image = null;
          }
        }
        placed.push({ image, x });
        x += image?.width ?? 320;
      }
      if (cancelled) return;

      const height = Math.max(
        240,
        ...placed.map((entry) => entry.image?.height ?? 0),
        ...scene.spawns.map((spawn) => spawn.y ?? 0),
      );
      canvas.width = Math.max(x, 640);
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#06b6d4';
      if (layers.background) context.fillRect(0, 0, canvas.width, height);
      for (const entry of layers.panels ? placed : []) {
        if (entry.image) context.drawImage(entry.image, entry.x, height - entry.image.height);
      }
      // Walls are drawn as a red line at their x position across the scene.
      context.strokeStyle = '#ef4444';
      context.lineWidth = 2;
      for (const wall of layers.holes ? scene.walls : []) {
        const wallX = wall.values.x ?? 0;
        context.beginPath();
        context.moveTo(wallX, 0);
        context.lineTo(wallX, height);
        context.stroke();
      }
      // Spawn coords place the sprite's feet: the sprite is centred on (coords x + at) and its bottom
      // sits on coords y, measured down from the top of the scene.
      for (const spawn of layers.entities ? scene.spawns : []) {
        const spawnX = (spawn.x ?? 0) + (spawn.at ?? 0);
        const spawnY = spawn.y ?? 0;
        const sprite = await loadSpawnSprite(project, assets, spawn.name);
        if (cancelled) return;
        const top = sprite ? spawnY - sprite.height : spawnY - 8;
        if (sprite) {
          context.drawImage(sprite, spawnX - sprite.width / 2, top);
        } else {
          context.fillStyle = '#f0f';
          context.fillRect(spawnX - 4, top, 8, 8);
        }
      }
      // Front layer: `frontpanel` images are drawn over the entities, bottom-aligned like panels.
      if (layers.front) {
        let frontX = 0;
        for (const front of scene.frontPanels) {
          const url = assets ? resolveAssetUrl(assets, front.image) : null;
          if (!url) continue;
          try {
            const image = await loadKeyedSprite(url);
            if (cancelled) return;
            context.drawImage(image, frontX, height - image.height);
            frontX += image.width;
          } catch {
            // A missing or undecodable front image is skipped, as the level still loads without it.
          }
        }
      }
      setStatus(letters.length === 0 ? 'No panels are in the order yet.' : null);
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [scene, assets, project, layers]);

  return (
    <div>
      {status ? <div className="small muted">{status}</div> : null}
      <div className="row" style={{ gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        {LAYER_LABELS.map(([key, label]) => (
          <label key={key} className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>
      <div style={{ position: 'relative', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block' }}
          onMouseMove={(event) => {
            const canvas = event.currentTarget;
            const rect = canvas.getBoundingClientRect();
            const x = Math.round(((event.clientX - rect.left) * canvas.width) / rect.width);
            const y = Math.round(((event.clientY - rect.top) * canvas.height) / rect.height);
            setCursor({ x, y });
          }}
          onMouseLeave={() => setCursor(null)}
        />
        {cursor ? (
          <div
            className="mono small"
            style={{
              position: 'absolute',
              left: cursor.x + 14,
              top: cursor.y + 14,
              pointerEvents: 'none',
              background: 'rgba(0, 0, 0, 0.75)',
              color: '#fff',
              padding: '2px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}
          >
            x {cursor.x}, y {cursor.y}
          </div>
        ) : null}
      </div>
      <div className="small mono" style={{ marginTop: 4, minHeight: 16 }}>
        {cursor ? `Scene x ${cursor.x}, y ${cursor.y}` : 'Hover the scene to read its x and y position.'}
      </div>
    </div>
  );
}

function WallRow({ wall, raw, commit }: { wall: LevelWall; raw: string; commit: Commit }) {
  const fields: WallField[] = ['x', 'z', 'upperLeft', 'lowerLeft', 'upperRight', 'lowerRight', 'depth', 'alt'];
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="small muted">{wall.kind}</span>
      {fields.map((field) => (
        <label key={field} className="small muted" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {field}
          <CommitInput
            type="number"
            width={64}
            value={wall.values[field] === null ? '' : String(wall.values[field])}
            onCommit={(next) => {
              const parsed = Number(next);
              if (next.trim() === '' || !Number.isFinite(parsed)) return;
              commit(setWallValues(raw, wall.line, { ...wall.values, [field]: parsed }), `Changed wall ${field}`);
            }}
          />
        </label>
      ))}
      <Button size="sm" variant="ghost" onClick={() => commit(removeWall(raw, wall.line), 'Removed wall')}>
        Remove
      </Button>
    </div>
  );
}

export function LevelTab({
  raw,
  projectId,
  commit,
  onPlay,
}: {
  raw: string;
  projectId: string;
  commit: Commit;
  onPlay?: () => void;
}) {
  const scene = useMemo(() => parseLevel(raw), [raw]);

  return (
    <div className="col" style={{ gap: 14 }}>
      {onPlay ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button icon={Play} onClick={onPlay}>
            Play in browser
          </Button>
        </div>
      ) : null}
      <ScenePreview raw={raw} projectId={projectId} />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <Card>
          <div className="col" style={{ gap: 8 }}>
            <strong>Music and background</strong>
            <label className="small muted">
              Music{' '}
              <CommitInput
                width={320}
                value={scene.music?.path ?? ''}
                onCommit={(next) => commit(setMusic(raw, next), 'Changed music')}
              />
            </label>
            <label className="small muted">
              Background{' '}
              <CommitInput
                width={320}
                value={scene.background?.path ?? ''}
                onCommit={(next) => commit(setBackground(raw, next), 'Changed background')}
              />
            </label>
            <label className="small muted">
              Order (panel letters){' '}
              <CommitInput
                width={200}
                value={scene.order}
                onCommit={(next) => commit(setOrder(raw, next), 'Changed order')}
              />
            </label>
          </div>
        </Card>

        <Card>
          <div className="col" style={{ gap: 6 }}>
            <strong>Panels ({scene.panels.length})</strong>
            {scene.panels.map((panel) => (
              <div key={panel.line} className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span className="mono small">{panel.letter}</span>
                <CommitInput
                  width={300}
                  value={panel.image}
                  onCommit={(next) => commit(setPanelImage(raw, panel.line, next, panel.mode), 'Changed panel image')}
                />
                <Button size="sm" variant="ghost" onClick={() => commit(removePanel(raw, panel.line), 'Removed panel')}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="col" style={{ gap: 6 }}>
          <div className="row-between">
            <strong>Walls and holes ({scene.walls.length})</strong>
            <Button size="sm" onClick={() => commit(addWall(raw, 0, 0), 'Added wall')}>
              Add wall
            </Button>
          </div>
          {scene.walls.map((wall) => (
            <WallRow key={wall.line} wall={wall} raw={raw} commit={commit} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="col" style={{ gap: 6 }}>
          <strong>Spawns ({scene.spawns.length})</strong>
          {scene.spawns.map((spawn) => (
            <div key={spawn.line} className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="mono small">{spawn.name}</span>
              <label className="small muted">
                x{' '}
                <CommitInput
                  type="number"
                  width={72}
                  value={String(spawn.x ?? 0)}
                  onCommit={(next) =>
                    commit(setSpawnPosition(raw, spawn.line, Number(next), spawn.y ?? 0), 'Changed spawn x')
                  }
                />
              </label>
              <label className="small muted">
                y{' '}
                <CommitInput
                  type="number"
                  width={72}
                  value={String(spawn.y ?? 0)}
                  onCommit={(next) =>
                    commit(setSpawnPosition(raw, spawn.line, spawn.x ?? 0, Number(next)), 'Changed spawn y')
                  }
                />
              </label>
              <label className="small muted">
                at{' '}
                <CommitInput
                  type="number"
                  width={72}
                  value={String(spawn.at ?? 0)}
                  onCommit={(next) => commit(setSpawnAt(raw, spawn.line, Number(next)), 'Changed spawn at')}
                />
              </label>
              <Button size="sm" variant="ghost" onClick={() => commit(removeSpawn(raw, spawn.line), 'Removed spawn')}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
