import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { LogoMark } from '@/components/layout/Logo';
import { Skeleton } from '@/components/ui/misc';
import { useSession } from '@/stores/session';

const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('@/pages/Auth').then((m) => ({ default: m.Register })));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Today = lazy(() => import('@/pages/app/Today'));
const Tasks = lazy(() => import('@/pages/app/Tasks'));
const Habits = lazy(() => import('@/pages/app/Habits'));
const Focus = lazy(() => import('@/pages/app/Focus'));
const Goals = lazy(() => import('@/pages/app/Goals'));
const Insights = lazy(() => import('@/pages/app/Insights'));
const Review = lazy(() => import('@/pages/app/Review'));
const Achievements = lazy(() => import('@/pages/app/Achievements'));
const Settings = lazy(() => import('@/pages/app/Settings'));

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" aria-busy="true" aria-label="Loading Trackly">
      <LogoMark className="h-9 w-16 animate-pulse" />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const location = useLocation();
  if (status === 'booting') return <Splash />;
  if (status === 'anonymous') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  if (status === 'booting') return <Splash />;
  if (status === 'authenticated') return <Navigate to="/app/today" replace />;
  return <>{children}</>;
}

const page = (el: ReactNode) => <Suspense fallback={<PageFallback />}>{el}</Suspense>;

export const router = createBrowserRouter([
  { path: '/', element: <Suspense fallback={<Splash />}><Landing /></Suspense> },
  { path: '/login', element: <PublicOnly><Suspense fallback={<Splash />}><Login /></Suspense></PublicOnly> },
  { path: '/register', element: <Suspense fallback={<Splash />}><Register /></Suspense> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="today" replace /> },
      { path: 'today', element: page(<Today />) },
      { path: 'tasks', element: page(<Tasks />) },
      { path: 'habits', element: page(<Habits />) },
      { path: 'focus', element: page(<Focus />) },
      { path: 'goals', element: page(<Goals />) },
      { path: 'insights', element: page(<Insights />) },
      { path: 'review', element: page(<Review />) },
      { path: 'achievements', element: page(<Achievements />) },
      { path: 'settings', element: page(<Settings />) },
    ],
  },
  { path: '*', element: <Suspense fallback={<Splash />}><NotFound /></Suspense> },
]);
