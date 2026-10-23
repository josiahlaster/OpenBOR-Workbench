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
import { resolveAssetUrl, useProjectAssets } from '../lib/assets';
import { Button, Card } from './ui';

type Commit = (next: string, action: string) => void;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(url);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(url));
      image.src = url;
    });
    imageCache.set(url, cached);
  }
  return cached;
}

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

function ScenePreview({ raw, projectId }: { raw: string; projectId: string }) {
  const scene = useMemo(() => parseLevel(raw), [raw]);
  const assets = useProjectAssets(projectId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string | null>(null);

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
      const placed: { image: HTMLImageElement | null; x: number }[] = [];
      let x = 0;
      for (const letter of letters) {
        const panel = panelByLetter.get(letter);
        const url = panel && assets ? resolveAssetUrl(assets, panel.image) : null;
        let image: HTMLImageElement | null = null;
        if (url) {
          try {
            image = await loadImage(url);
          } catch {
            image = null;
          }
        }
        placed.push({ image, x });
        x += image?.naturalWidth ?? 320;
      }
      if (cancelled) return;

      const height = Math.max(240, ...placed.map((entry) => entry.image?.naturalHeight ?? 0));
      canvas.width = Math.max(x, 640);
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#06b6d4';
      context.fillRect(0, 0, canvas.width, height);
      for (const entry of placed) {
        if (entry.image) context.drawImage(entry.image, entry.x, height - entry.image.naturalHeight);
      }
      // Walls are drawn as a red line at their x position across the scene.
      context.strokeStyle = '#ef4444';
      context.lineWidth = 2;
      for (const wall of scene.walls) {
        const wallX = wall.values.x ?? 0;
        context.beginPath();
        context.moveTo(wallX, 0);
        context.lineTo(wallX, height);
        context.stroke();
      }
      // Spawns are drawn as magenta markers; y is measured up from the bottom of the scene.
      context.fillStyle = '#f0f';
      context.font = '12px monospace';
      for (const spawn of scene.spawns) {
        const spawnX = spawn.x ?? 0;
        const spawnY = height - (spawn.y ?? 0);
        context.fillRect(spawnX - 4, spawnY - 4, 8, 8);
        context.fillText(spawn.name, spawnX + 6, spawnY);
      }
      setStatus(letters.length === 0 ? 'No panels are in the order yet.' : null);
    };

    void draw();
    return () => {
      cancelled = true;
    };
  }, [scene, assets]);

  return (
    <div>
      {status ? <div className="small muted">{status}</div> : null}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
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

export function LevelTab({ raw, projectId, commit }: { raw: string; projectId: string; commit: Commit }) {
  const scene = useMemo(() => parseLevel(raw), [raw]);

  return (
    <div className="col" style={{ gap: 14 }}>
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
