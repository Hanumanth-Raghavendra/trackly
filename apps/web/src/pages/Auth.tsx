import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError, applySession, request } from '@/api/client';
import type { AuthResponse } from '@/api/types';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { browserTimezone } from '@/lib/platform';
import { useSession } from '@/stores/session';

export async function startDemo(): Promise<void> {
  const res = await request<AuthResponse>('core', '/api/v1/auth/demo', {
    method: 'POST',
    auth: false,
    body: { timezone: browserTimezone() },
  });
  await applySession(res);
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-track-deep p-12 text-white lg:flex lg:flex-col dark:bg-[#0d1a4d]">
        {/* lane lines curving like the bend of a track */}
        <svg className="absolute -right-40 -bottom-40 h-[720px] w-[720px] opacity-40" viewBox="0 0 720 720" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx="720" cy="720" r={260 + i * 70} fill="none" stroke="#ffffff" strokeWidth="2" />
          ))}
          <circle cx={720 - 260 * Math.cos(0.8)} cy={720 - 260 * Math.sin(0.8)} r="14" fill="#c6f432" />
        </svg>
        <Link to="/" className="relative">
          <Logo className="[&_span]:text-white" />
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-[64px] leading-[0.9]">Small laps add up.</p>
          <p className="mt-4 text-lg text-white/75">
            Tasks, habits and focus sessions in one place. Trackly notices when you do your best work and where your
            days slip, then tells you what to change.
          </p>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <h1 className="font-display text-5xl">{title}</h1>
          <p className="mt-2 text-ink-soft">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function DemoButton() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        variant="volt"
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await startDemo();
            navigate('/app/today');
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not start the demo');
          } finally {
            setLoading(false);
          }
        }}
      >
        Explore a demo account
      </Button>
      {error && <p className="mt-2 text-sm text-signal">{error}</p>}
    </>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await request<AuthResponse>('core', '/api/v1/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      await applySession(res);
      navigate(params.get('next') || '/app/today', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to pick up where you left off.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email">
          {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password">
          {(p) => (
            <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-[10px] bg-signal-soft px-3 py-2 text-sm text-signal">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign in
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-lane" /> or <span className="h-px flex-1 bg-lane" />
      </div>
      <DemoButton />
      <p className="mt-8 text-center text-sm text-ink-soft">
        New to Trackly?{' '}
        <Link to="/register" className="font-semibold text-track hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

export function Register() {
  const navigate = useNavigate();
  const wasDemo = useSession((s) => s.user?.demo);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tz = browserTimezone();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrors({});
    try {
      const res = await request<AuthResponse>('core', '/api/v1/auth/register', {
        method: 'POST',
        auth: false,
        body: { displayName: name, email, password, timezone: tz },
      });
      await applySession(res);
      navigate('/app/today', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors ?? {});
        setError(err.errors ? null : err.message);
      } else setError('Could not create the account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle={wasDemo ? 'Start fresh with your own data. The demo stays separate.' : 'Free, and it takes about 20 seconds.'}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.displayName}>
          {(p) => <Input {...p} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Password" hint="At least 8 characters" error={errors.password}>
          {(p) => (
            <Input {...p} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <p className="text-xs text-ink-faint">Timezone: {tz}. Days, streaks and reminders follow it.</p>
        {error && (
          <p role="alert" className="rounded-[10px] bg-signal-soft px-3 py-2 text-sm text-signal">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-track hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
