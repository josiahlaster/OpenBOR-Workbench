export function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function relativeTime(timestamp: number): string {
  const delta = timestamp - Date.now();
  const abs = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60_000) return formatter.format(Math.round(delta / 1000), 'second');
  if (abs < 3_600_000) return formatter.format(Math.round(delta / 60_000), 'minute');
  if (abs < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return formatter.format(Math.round(delta / 86_400_000), 'day');
  return formatDate(timestamp).split(',')[0] ?? '';
}

export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function entityKind(type: string | null | undefined): 'player' | 'enemy' | 'npc' | 'item' | 'other' {
  switch ((type ?? '').toLowerCase()) {
    case 'player':
      return 'player';
    case 'enemy':
      return 'enemy';
    case 'npc':
      return 'npc';
    case 'item':
      return 'item';
    default:
      return 'other';
  }
}

export function typeLabel(type: string | null | undefined): string {
  if (!type) return 'No type';
  const labels: Record<string, string> = {
    player: 'Player',
    enemy: 'Enemy',
    npc: 'NPC',
    item: 'Item',
    obstacle: 'Obstacle',
    steamer: 'Steamer',
    pshot: 'Projectile',
    trap: 'Trap',
    text: 'Text',
    endlevel: 'End level',
    panel: 'Panel',
    none: 'None',
  };
  return labels[type.toLowerCase()] ?? type;
}

export type BadgeTone =
  | 'player'
  | 'enemy'
  | 'npc'
  | 'item'
  | 'other'
  | 'error'
  | 'warning'
  | 'info'
  | 'success'
  | 'neutral';

export function typeTone(type: string | null | undefined): BadgeTone {
  switch (entityKind(type)) {
    case 'player':
      return 'player';
    case 'enemy':
      return 'enemy';
    case 'npc':
      return 'npc';
    case 'item':
      return 'item';
    default:
      return 'other';
  }
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, value: unknown): void {
  downloadText(filename, JSON.stringify(value, null, 2), 'application/json');
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function cleanFileName(name: string, fallback = 'model'): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

export function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}
