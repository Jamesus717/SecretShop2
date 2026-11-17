import { Suspense } from 'react';
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
        <Suspense fallback={null}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
