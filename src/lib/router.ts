import { useEffect, useState } from 'react';

export type RouteName =
  | 'dashboard'
  | 'projects'
  | 'entities'
  | 'editor'
  | 'compare'
  | 'validation'
  | 'manifest'
  | 'docs'
  | 'settings';

export interface Route {
  name: RouteName;
  param?: string;
  query: URLSearchParams;
}

const ROUTE_NAMES: RouteName[] = [
  'dashboard',
  'projects',
  'entities',
  'editor',
  'compare',
  'validation',
  'manifest',
  'docs',
  'settings',
];

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const [name, param] = pathPart.split('/').filter(Boolean);
  const routeName = ROUTE_NAMES.includes(name as RouteName) ? (name as RouteName) : 'dashboard';
  return {
    name: routeName,
    param: param ? decodeURIComponent(param) : undefined,
    query: new URLSearchParams(queryPart),
  };
}

export function navigate(path: string): void {
  const next = path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function routeHref(path: string): string {
  return path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.hash = '#/dashboard';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function setQueryParam(key: string, value: string | null, route?: Route): void {
  const current = route ?? parseHash(window.location.hash);
  const query = new URLSearchParams(current.query);
  if (value === null) query.delete(key);
  else query.set(key, value);
  const qs = query.toString();
  navigate(`${current.name}${current.param ? `/${current.param}` : ''}${qs ? `?${qs}` : ''}`);
}
