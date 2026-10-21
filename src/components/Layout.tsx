import {
  AlertTriangle,
  BookOpen,
  Database,
  FileCode2,
  FolderKanban,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { basename, classNames } from '../lib/format';
import { navigate, routeHref, useRoute } from '../lib/router';
import { useApp } from '../state/AppStore';
import { useImport } from './ImportDialog';
import { IconButton } from './ui';
import { WorkbenchMark } from './WorkbenchMark';

const ROUTE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  entities: 'Entities',
  editor: 'Editor',
  compare: 'Compare',
  validation: 'Validation',
  manifest: 'models.txt',
  docs: 'Documentation',
  settings: 'Settings',
};

interface NavItem {
  route: string;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
  alert?: boolean;
}

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute();
  const {
    activeProject,
    projects,
    setActiveProject,
    settings,
    updateSettings,
    notices,
    dismissNotice,
    persistenceError,
    validation,
  } = useApp();
  const { openImport } = useImport();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [route.name, route.param]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 760) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const lastEntityId = activeProject?.lastOpenedEntityId;
  const lastEntity = activeProject?.entities.find((entity) => entity.id === lastEntityId);
  const workspace: NavItem[] = [
    { route: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { route: 'projects', label: 'Projects', icon: FolderKanban, count: projects.length },
    { route: 'entities', label: 'Entities', icon: Users, count: activeProject?.entities.length },
    {
      route: lastEntity ? `editor/${lastEntity.id}` : 'entities',
      label: 'Editor',
      icon: FileCode2,
    },
    { route: 'manifest', label: 'models.txt', icon: Database },
  ];
  const analysis: NavItem[] = [
    { route: 'compare', label: 'Compare', icon: GitCompareArrows },
    {
      route: 'validation',
      label: 'Validation',
      icon: ShieldCheck,
      count: validation ? validation.errors + validation.warnings : undefined,
      alert: Boolean(validation && validation.errors > 0),
    },
  ];
  const reference: NavItem[] = [
    { route: 'docs', label: 'Documentation', icon: BookOpen },
    { route: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const itemRoute = item.route.split('/')[0];
      const active =
        item.label === 'Editor'
          ? route.name === 'editor'
          : route.name === itemRoute &&
            (route.name !== 'editor' || !item.route.includes('/') || route.param === lastEntity?.id);
      return (
        <a
          key={item.label}
          href={routeHref(item.route)}
          className={classNames('nav-link', active && 'active')}
          aria-current={active ? 'page' : undefined}
          onClick={() => setMobileOpen(false)}
        >
          <item.icon />
          <span>{item.label}</span>
          {typeof item.count === 'number' && item.count > 0 ? (
            <span className={classNames('nav-count', item.alert && 'alert')}>{item.count}</span>
          ) : null}
        </a>
      );
    });

  const editorEntity = route.name === 'editor'
    ? activeProject?.entities.find((entity) => entity.id === route.param)
    : null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileOpen ? (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      ) : null}
      <aside className={classNames('sidebar', mobileOpen && 'open')} aria-label="Primary navigation">
        <a href={routeHref('dashboard')} className="brand" onClick={() => setMobileOpen(false)}>
          <WorkbenchMark size={38} className="brand-mark" style={{ overflow: 'hidden' }} />
          <span>
            <span className="brand-name">OpenBOR Workbench</span>
            <span className="brand-sub" style={{ display: 'block' }}>
              just the bizzz
            </span>
          </span>
        </a>

        <div className="project-switcher">
          <label htmlFor="active-project">Active project</label>
          <select
            id="active-project"
            value={activeProject?.id ?? ''}
            onChange={(event) => setActiveProject(event.target.value || null)}
          >
            <option value="">No project selected</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="nav">
          <div>
            <div className="nav-section-title">Workspace</div>
            <div className="nav-links">{renderNav(workspace)}</div>
          </div>
          <div>
            <div className="nav-section-title">Analysis</div>
            <div className="nav-links">{renderNav(analysis)}</div>
          </div>
          <div>
            <div className="nav-section-title">Reference</div>
            <div className="nav-links">{renderNav(reference)}</div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <span>Local-first · 1.0</span>
          <IconButton
            icon={settings.theme === 'light' ? Moon : Sun}
            label={settings.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            size="sm"
            onClick={() =>
              void updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })
            }
          />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <IconButton
            icon={Menu}
            label="Open navigation"
            className="menu-toggle"
            onClick={() => setMobileOpen(true)}
          />
          <div className="topbar-crumbs">
            <a href={routeHref('dashboard')}>Workspace</a>
            <span aria-hidden="true">/</span>
            {activeProject ? (
              <>
                <a className="crumb-project" href={routeHref('projects')}>
                  {activeProject.name}
                </a>
                <span className="crumb-project" aria-hidden="true">/</span>
              </>
            ) : null}
            <strong>{editorEntity ? basename(editorEntity.fileName) : ROUTE_LABEL[route.name] ?? 'Workspace'}</strong>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => openImport(activeProject ? 'into' : 'create')}
            >
              <Upload />
              <span className="hide-mobile">Import</span>
            </button>
            <IconButton
              icon={settings.theme === 'light' ? Moon : Sun}
              label={settings.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              onClick={() =>
                void updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })
              }
            />
          </div>
        </header>

        <main className="content" id="main-content">
          {persistenceError ? (
            <div className="alert-banner" role="alert">
              <AlertTriangle size={15} />
              <div>
                <strong>Local persistence problem.</strong> {persistenceError}
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('settings')}>
                Settings
              </button>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {notices.map((notice) => (
          <div key={notice.id} className={`toast ${notice.tone}`} role="status">
            <span className="small" style={{ lineHeight: 1.5 }}>
              {notice.message}
            </span>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismissNotice(notice.id)}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
