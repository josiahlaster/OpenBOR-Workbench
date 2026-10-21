import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { setFrameAttack, setFrameProperty } from '../core/editor';
import type { AttackBox, ModelAnimation, ModelFrame } from '../core/types';
import { loadKeyedSprite, resolveAssetUrl, useProjectAssets } from '../lib/assets';
import { basename, classNames } from '../lib/format';
import { IconButton } from './ui';
import './sprite.css';

const CANVAS_W = 720;
const CANVAS_H = 360;
/** Screen position of the frame's anchor (the offset point), which sits on the ground line. */
const ANCHOR_X = CANVAS_W / 2;
const ANCHOR_Y = Math.round(CANVAS_H * 0.8);
const GRAB_PX = 9;
const ZOOMS = [1, 2, 3, 4];

/** x, y, width, height in sprite or anchor pixels. */
type Box = [number, number, number, number];
type Target = 'body' | 'attack' | 'offset';

interface Draft {
  body?: Box;
  attack?: Box;
  offset?: [number, number];
}

interface Drag {
  target: Target;
  resize: boolean;
  startX: number;
  startY: number;
  base: number[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toRect(box: Box, zoom: number, originX: number, originY: number): Rect {
  return { x: originX + box[0] * zoom, y: originY + box[1] * zoom, w: box[2] * zoom, h: box[3] * zoom };
}

function insideRect(rect: Rect, px: number, py: number): boolean {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function nearCorner(rect: Rect, px: number, py: number): boolean {
  return Math.abs(px - (rect.x + rect.w)) <= GRAB_PX && Math.abs(py - (rect.y + rect.h)) <= GRAB_PX;
}

export function FrameThumb({
  url,
  width = 96,
  height = 72,
}: {
  url: string | null;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!url) return undefined;
    let active = true;
    loadKeyedSprite(url)
      .then((sprite) => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!active || !canvas || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / sprite.width, canvas.height / sprite.height);
        const width = sprite.width * scale;
        const height = sprite.height * scale;
        context.imageSmoothingEnabled = false;
        context.drawImage(sprite, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [url]);
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={classNames('sprite-thumb', !url && 'missing')}
      aria-hidden="true"
    />
  );
}

export function SpritePreview({
  projectId,
  raw,
  commit,
  animation,
  frame,
  onSelectFrame,
}: {
  projectId: string;
  raw: string;
  commit: (next: string, action: string) => void;
  animation: ModelAnimation;
  frame: ModelFrame;
  onSelectFrame: (frame: ModelFrame) => void;
}) {
  const assets = useProjectAssets(projectId);
  const urlFor = (path: string | null) => (assets && path ? resolveAssetUrl(assets, path) : null);
  const url = urlFor(frame.image);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sprite, setSprite] = useState<HTMLCanvasElement | null>(null);
  const [spriteError, setSpriteError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2);
  const [draft, setDraft] = useState<Draft>({});
  const draftRef = useRef<Draft>({});
  const dragRef = useRef<Drag | null>(null);
  const [selected, setSelected] = useState<Target>('body');
  const [playing, setPlaying] = useState(false);

  const frames = animation.frames;
  const index = frames.findIndex((candidate) => candidate.line === frame.line);

  useEffect(() => {
    draftRef.current = {};
    dragRef.current = null;
    setDraft({});
  }, [frame.line]);

  useEffect(() => {
    setSprite(null);
    setSpriteError(null);
    if (!url) return undefined;
    let active = true;
    loadKeyedSprite(url)
      .then((loaded) => {
        if (active) setSprite(loaded);
      })
      .catch((error: unknown) => {
        if (active) setSpriteError(error instanceof Error ? error.message : 'The sprite could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [url]);

  // Playback: advance one frame per delay (OpenBOR delays are centiseconds).
  useEffect(() => {
    if (!playing || frames.length === 0) return undefined;
    const delayMs = Math.max(1, frame.delay) * 10;
    const timer = window.setTimeout(() => {
      const next = frames[(index + 1) % frames.length];
      if (next) onSelectFrame(next);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [playing, frame, frames, index, onSelectFrame]);

  const body: Box | null =
    draft.body ?? (frame.bbox ? [frame.bbox[0], frame.bbox[1], frame.bbox[2], frame.bbox[3]] : null);
  const attack: Box | null =
    draft.attack ??
    (frame.attack ? [frame.attack.x, frame.attack.y, frame.attack.width, frame.attack.height] : null);
  const offset: [number, number] = draft.offset ?? [frame.offset?.[0] ?? 0, frame.offset?.[1] ?? 0];

  const spriteX = ANCHOR_X - offset[0] * zoom;
  const spriteY = ANCHOR_Y - offset[1] * zoom;
  const bodyRect = body ? toRect(body, zoom, spriteX, spriteY) : null;
  const attackRect = attack ? toRect(attack, zoom, ANCHOR_X, ANCHOR_Y) : null;

  const message = !frame.image
    ? 'This frame has no sprite (frame none).'
    : !assets
      ? 'Loading project images…'
      : !url
        ? `Image "${frame.image}" is not in this project. Import the folder that contains it.`
        : spriteError ?? (sprite ? null : 'Loading sprite…');

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#0c0f14';
    context.fillRect(0, 0, CANVAS_W, CANVAS_H);
    context.strokeStyle = 'rgba(255,255,255,0.05)';
    context.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 40) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, CANVAS_H);
      context.stroke();
    }
    context.strokeStyle = 'rgba(255,255,255,0.12)';
    context.beginPath();
    context.moveTo(0, ANCHOR_Y + 0.5);
    context.lineTo(CANVAS_W, ANCHOR_Y + 0.5);
    context.stroke();

    if (sprite) {
      context.drawImage(sprite, spriteX, spriteY, sprite.width * zoom, sprite.height * zoom);
    } else if (message) {
      context.fillStyle = '#8b93a1';
      context.font = '14px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(message, CANVAS_W / 2, CANVAS_H / 2);
    }

    if (bodyRect) {
      context.fillStyle = 'rgba(70,130,255,0.25)';
      context.strokeStyle = selected === 'body' ? '#ffffff' : '#5a9bff';
      context.lineWidth = 2;
      context.fillRect(bodyRect.x, bodyRect.y, bodyRect.w, bodyRect.h);
      context.strokeRect(bodyRect.x, bodyRect.y, bodyRect.w, bodyRect.h);
      context.fillStyle = '#5a9bff';
      context.fillRect(bodyRect.x + bodyRect.w - 4, bodyRect.y + bodyRect.h - 4, 8, 8);
      context.font = '11px system-ui, sans-serif';
      context.textAlign = 'left';
      context.fillText('body', bodyRect.x + 3, bodyRect.y + 12);
    }
    if (attackRect) {
      context.fillStyle = 'rgba(255,80,80,0.3)';
      context.strokeStyle = selected === 'attack' ? '#ffffff' : '#ff5a5a';
      context.lineWidth = 2;
      context.fillRect(attackRect.x, attackRect.y, attackRect.w, attackRect.h);
      context.strokeRect(attackRect.x, attackRect.y, attackRect.w, attackRect.h);
      context.fillStyle = '#ff5a5a';
      context.fillRect(attackRect.x + attackRect.w - 4, attackRect.y + attackRect.h - 4, 8, 8);
      context.font = '11px system-ui, sans-serif';
      context.textAlign = 'left';
      context.fillText('attack', attackRect.x + 3, attackRect.y + 12);
    }

    // Anchor (offset) crosshair.
    context.strokeStyle = selected === 'offset' ? '#ffffff' : '#ffd34d';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(ANCHOR_X - 14, ANCHOR_Y + 0.5);
    context.lineTo(ANCHOR_X + 14, ANCHOR_Y + 0.5);
    context.moveTo(ANCHOR_X + 0.5, ANCHOR_Y - 14);
    context.lineTo(ANCHOR_X + 0.5, ANCHOR_Y + 14);
    context.stroke();
  });

  const pointerPosition = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * CANVAS_W) / rect.width,
      y: ((event.clientY - rect.top) * CANVAS_H) / rect.height,
    };
  };

  const hitTest = (px: number, py: number): { target: Target; resize: boolean } | null => {
    if (attackRect && nearCorner(attackRect, px, py)) return { target: 'attack', resize: true };
    if (bodyRect && nearCorner(bodyRect, px, py)) return { target: 'body', resize: true };
    if (attackRect && insideRect(attackRect, px, py)) return { target: 'attack', resize: false };
    if (bodyRect && insideRect(bodyRect, px, py)) return { target: 'body', resize: false };
    if (Math.abs(px - ANCHOR_X) <= GRAB_PX && Math.abs(py - ANCHOR_Y) <= GRAB_PX) {
      return { target: 'offset', resize: false };
    }
    return null;
  };

  const commitBody = (box: Box) => {
    const z = frame.bbox?.[4];
    const values = [box[0], box[1], box[2], box[3], ...(z !== undefined ? [z] : [])].map(String);
    commit(setFrameProperty(raw, frame.line, 'bbox', values), 'Moved body box');
  };

  const commitAttack = (box: Box) => {
    if (!frame.attack) return;
    const next: AttackBox = {
      ...frame.attack,
      x: box[0],
      y: box[1],
      width: box[2],
      height: box[3],
    };
    commit(setFrameAttack(raw, frame.line, next, next.command), 'Moved attack box');
  };

  const commitOffset = (point: [number, number]) => {
    commit(setFrameProperty(raw, frame.line, 'offset', [String(point[0]), String(point[1])]), 'Moved offset');
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pointerPosition(event);
    const hit = hitTest(point.x, point.y);
    setSelected(hit ? hit.target : selected);
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const base =
      hit.target === 'body' ? body : hit.target === 'attack' ? attack : offset;
    if (!base) return;
    dragRef.current = {
      target: hit.target,
      resize: hit.resize,
      startX: point.x,
      startY: point.y,
      base: [...base],
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointerPosition(event);
    const dx = Math.round((point.x - drag.startX) / zoom);
    const dy = Math.round((point.y - drag.startY) / zoom);
    const [bx, by, bw, bh] = drag.base;
    let next: Draft;
    if (drag.target === 'offset') {
      next = { offset: [bx - dx, by - dy] };
    } else {
      const box: Box = drag.resize
        ? [bx, by, Math.max(1, bw + dx), Math.max(1, bh + dy)]
        : [bx + dx, by + dy, bw, bh];
      next = drag.target === 'body' ? { body: box } : { attack: box };
    }
    const merged = { ...draftRef.current, ...next };
    draftRef.current = merged;
    setDraft(merged);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    const finished = draftRef.current;
    draftRef.current = {};
    setDraft({});
    if (!drag) return;
    if (finished.body) commitBody(finished.body);
    if (finished.attack) commitAttack(finished.attack);
    if (finished.offset) commitOffset(finished.offset);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    if (selected === 'body' && body) {
      commitBody([body[0] + delta[0], body[1] + delta[1], body[2], body[3]]);
    } else if (selected === 'attack' && attack) {
      commitAttack([attack[0] + delta[0], attack[1] + delta[1], attack[2], attack[3]]);
    } else if (selected === 'offset') {
      commitOffset([offset[0] - delta[0], offset[1] - delta[1]]);
    }
  };

  const stepFrame = (direction: number) => {
    const next = frames[index + direction];
    if (next) onSelectFrame(next);
  };

  return (
    <div className="sprite-panel">
      <div className="sprite-toolbar">
        <IconButton icon={SkipBack} label="Previous frame" size="sm" onClick={() => stepFrame(-1)} disabled={index <= 0} />
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? 'Pause playback' : 'Play animation'}
          size="sm"
          onClick={() => setPlaying((value) => !value)}
          disabled={frames.length < 2}
        />
        <IconButton
          icon={SkipForward}
          label="Next frame"
          size="sm"
          onClick={() => stepFrame(1)}
          disabled={index < 0 || index >= frames.length - 1}
        />
        <label className="tiny muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Zoom
          <select className="input sm" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            {ZOOMS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <span className="tiny muted">
          Drag a box to move it, drag its corner to resize, or select it and use arrow keys (Shift = 10px).
        </span>
      </div>
      <div className="sprite-stage">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="sprite-canvas"
          tabIndex={0}
          aria-label="Sprite and hitbox editor"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="sprite-readout mono tiny">
        <span>
          frame {frame.number} · {frame.image ? basename(frame.image) : 'none'}
        </span>
        <span>
          body {body ? `${body[0]}, ${body[1]} · ${body[2]}×${body[3]}` : 'none'}
        </span>
        <span>
          attack {attack ? `${attack[0]}, ${attack[1]} · ${attack[2]}×${attack[3]}` : 'none'}
        </span>
        <span>
          offset {offset[0]}, {offset[1]}
        </span>
      </div>
      <div className="sprite-strip" role="list" aria-label="Animation frames">
        {frames.map((candidate) => (
          <button
            key={candidate.line}
            type="button"
            role="listitem"
            className={classNames('sprite-strip-item', candidate.line === frame.line && 'active')}
            onClick={() => onSelectFrame(candidate)}
            title={candidate.image ?? 'none'}
          >
            <FrameThumb url={urlFor(candidate.image)} />
            <span className="mono tiny">{candidate.number}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
