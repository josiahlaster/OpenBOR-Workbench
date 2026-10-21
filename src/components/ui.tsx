import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { classNames, formatNumber } from '../lib/format';
import type { Severity } from '../core/types';

type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={classNames(
        'btn',
        variant !== 'default' && `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="spinner" style={{ width: 13, height: 13 }} /> : Icon ? <Icon /> : null}
      {children}
      {IconRight ? <IconRight /> : null}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={classNames('btn', 'btn-icon', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon />
    </button>
  );
}

export function Card({
  children,
  className,
  flat,
  style,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={classNames('card', flat && 'card-flat', className)} style={style}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <div className="page-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  foot,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  foot?: ReactNode;
  icon?: LucideIcon;
  tone?: 'accent' | 'danger' | 'teal';
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {Icon ? <Icon /> : null}
        {label}
      </div>
      <div className={classNames('stat-value', tone)}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </div>
      {foot ? <div className="stat-foot">{foot}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  icon: Icon,
  title,
}: {
  children: ReactNode;
  tone?: 'player' | 'enemy' | 'npc' | 'item' | 'other' | 'error' | 'warning' | 'info' | 'success' | 'neutral';
  icon?: LucideIcon;
  title?: string;
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {Icon ? <Icon /> : null}
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {Icon ? (
        <div className="empty-icon">
          <Icon />
        </div>
      ) : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  width,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
  id?: string;
}) {
  return (
    <div className="search-field" style={{ width }}>
      <Search aria-hidden="true" />
      <input
        id={id}
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="btn btn-icon btn-ghost btn-sm search-clear"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <X />
        </button>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
      {error ? <div className="field-hint text-danger">{error}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  closeLabel = 'Close dialog',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea, button:not(.modal-close), [href]',
      );
      focusable?.focus();
    }, 30);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={classNames('modal', wide && 'modal-wide')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <IconButton className="modal-close" icon={X} label={closeLabel} onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        {description}
      </div>
    </Modal>
  );
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={classNames('tab', value === item.id && 'active')}
          onClick={() => onChange(item.id)}
        >
          {item.icon ? <item.icon style={{ width: 13, height: 13 }} /> : null}
          {item.label}
          {typeof item.count === 'number' ? <span className="tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function BarList({
  items,
  emptyLabel = 'No data yet.',
  max,
}: {
  items: { label: string; value: number; hint?: string }[];
  emptyLabel?: string;
  max?: number;
}) {
  if (items.length === 0) return <div className="muted small">{emptyLabel}</div>;
  const peak = max ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.label} title={item.hint}>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(1, (item.value / peak) * 100)}%` }}
            />
          </span>
          <span className="bar-value">{formatNumber(item.value, 1)}</span>
        </div>
      ))}
    </div>
  );
}

export function MiniChart({
  values,
  labels,
  ariaLabel,
}: {
  values: number[];
  labels?: string[];
  ariaLabel?: string;
}) {
  if (values.length === 0) return <div className="muted small">No data yet.</div>;
  const peak = Math.max(...values, 1);
  return (
    <>
      <div className="mini-chart" role="img" aria-label={ariaLabel ?? 'Distribution chart'}>
        {values.map((value, index) => (
          <span
            key={`${index}-${value}`}
            className="mini-bar"
            style={{ height: `${Math.max(3, (value / peak) * 100)}%` }}
            title={`${labels?.[index] ?? index}: ${value}`}
          />
        ))}
      </div>
      {labels ? (
        <div className="mini-chart-labels">
          {labels.map((label, index) => (
            <span key={`${label}-${index}`} title={label}>
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function SeverityIcon({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const Icon = severity === 'error' ? AlertCircle : severity === 'warning' ? AlertTriangle : Info;
  return <Icon size={size} aria-hidden="true" />;
}

export function SeverityBadge({ severity, count }: { severity: Severity; count: number }) {
  const labels = { error: 'error', warning: 'warning', info: 'info' } as const;
  return (
    <Badge tone={severity === 'info' ? 'info' : severity}>
      {count} {labels[severity]}
      {count === 1 ? '' : 's'}
    </Badge>
  );
}

export function SuccessHint({ children }: { children: ReactNode }) {
  return (
    <div className="row small text-success">
      <CheckCircle2 size={13} />
      {children}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classNames('input', props.className)} />;
}

export function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="kbd-hint">
      {keys.map((key) => (
        <kbd className="kbd" key={key}>
          {key}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}
