import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Layout } from './components/Layout';
import { ImportProvider } from './components/ImportDialog';
import { Button, EmptyState } from './components/ui';
import { useRoute } from './lib/router';
import { AppProvider, useApp } from './state/AppStore';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Entities } from './pages/Entities';
import { Editor } from './pages/Editor';
import { Compare } from './pages/Compare';
import { ValidationPage } from './pages/ValidationPage';
import { Manifest } from './pages/Manifest';
import { Docs } from './pages/Docs';
import { Git } from './pages/Git';
import { Settings } from './pages/Settings';

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  entities: 'Entities',
  editor: 'Editor',
  compare: 'Compare',
  validation: 'Validation',
  manifest: 'models.txt',
  docs: 'Documentation',
  settings: 'Settings',
  git: 'Git',
};

function Shell() {
  const route = useRoute();
  const { ready } = useApp();

  useEffect(() => {
    document.title = `${PAGE_TITLES[route.name] ?? 'Workspace'} · OpenBOR Workbench`;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route.name, route.param]);

  if (!ready) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Loading local projects…</span>
      </div>
    );
  }

  let page: ReactNode;
  switch (route.name) {
    case 'projects':
      page = <Projects />;
      break;
    case 'entities':
      page = <Entities />;
      break;
    case 'editor':
      page = <Editor />;
      break;
    case 'compare':
      page = <Compare />;
      break;
    case 'validation':
      page = <ValidationPage />;
      break;
    case 'manifest':
      page = <Manifest />;
      break;
    case 'docs':
      page = <Docs />;
      break;
    case 'git':
      page = <Git />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    case 'dashboard':
    default:
      page = <Dashboard />;
      break;
  }

  return <Layout>{page}</Layout>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OpenBOR Stats crashed while rendering.', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="loading-screen" style={{ padding: 24 }}>
          <EmptyState
            title="Something went wrong in the interface"
            description={
              <>
                The saved data is still in IndexedDB. Reload the page to try again. If the problem repeats,
                export a backup from Settings before clearing site data.
                <br />
                <span className="mono small">{this.state.error.message}</span>
              </>
            }
            actions={
              <Button variant="primary" onClick={() => window.location.reload()}>
                Reload application
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ImportProvider>
          <Shell />
        </ImportProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
