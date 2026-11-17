import { Suspense, useEffect } from 'react';
import { SITE_NAME } from '../config';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import Layout from './Layout';
import NotFoundPage from './NotFoundPage';
import ScrollToTop from './ScrollToTop';
import { cleanPathFor, routeTable } from './routes';

/** Redirect keeping query + hash, so old `/rules#stand-ins` links still land on the section. */
function RedirectTo({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

const pages = routeTable.filter((r) => r.Component);
const HOME_TITLE = document.title;

/** Per-page tab title, so tabs, history and shared links say which page they are. */
function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const hit = pages.find((r) => r.path === path);
    document.title = path === '/' ? HOME_TITLE : `${hit?.title ?? 'Page not found'} | ${SITE_NAME}`;
  }, [pathname]);
  return null;
}
const redirects = routeTable.filter((r) => r.redirect);

/**
 * Redirects render outside Layout (see RouteDef.redirect), including old `*.html` URLs:
 * `/playoffs.html?x=1#y` -> `/playoffs?x=1#y`. Anything else unknown is a 404.
 */
function AppRoutes() {
  const { pathname } = useLocation();
  const clean = cleanPathFor(pathname);
  if (clean) return <RedirectTo to={clean} />;
  return (
    <Routes>
      {redirects.map(({ path, redirect }) => (
        <Route key={path} path={path} element={<RedirectTo to={redirect!} />} />
      ))}
      <Route element={<Layout />}>
        {pages.map(({ path, Component: C }) => (
          <Route key={path} path={path} element={C ? <C /> : null} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <PageTitle />
        <Suspense fallback={null}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
