import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import Layout from './Layout';
import NotFoundPage from './NotFoundPage';
import ScrollToTop from './ScrollToTop';
import { cleanPathFor, routeTable } from './routes';

/** `/playoffs.html?x=1#y` -> `/playoffs?x=1#y`; anything else unknown is a 404. */
function CatchAll() {
  const { pathname, search, hash } = useLocation();
  const clean = cleanPathFor(pathname);
  if (clean) return <Navigate to={`${clean}${search}${hash}`} replace />;
  return <NotFoundPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Suspense fallback={null}>
          <Routes>
            <Route element={<Layout />}>
              {routeTable.map(({ path, Component }) => (
                <Route key={path} path={path} element={<Component />} />
              ))}
              <Route path="*" element={<CatchAll />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
