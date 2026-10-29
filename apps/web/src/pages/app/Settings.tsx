import { CodeXml, Download, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { core, insights, logout } from '@/api/client';
import { useChangePassword, useDeleteAccount, useInsightsConfig, useMe, useUpdateProfile } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented, Skeleton, Switch } from '@/components/ui/misc';
import { API_URL, GITHUB_URL, isNative } from '@/lib/platform';
import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';
import { setTheme, useTheme, type ThemeChoice } from '@/lib/theme';
import { refreshSession } from '@/api/client';
import type { User } from '@/api/types';

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-lane py-8 first:border-t-0 first:pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <h2 className="font-bold">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Profile() {
  const { data: me } = useMe();
  if (!me) return <Skeleton className="h-48" />;
  return <ProfileForm key={me.id} me={me} />;
}

function ProfileForm({ me }: { me: User }) {
  const update = useUpdateProfile();
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);
  const [name, setName] = useState(me.displayName);
  const [tz, setTz] = useState(me.timezone);
  const [goal, setGoal] = useState(me.focusGoalMinutes);

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await update.mutateAsync({ displayName: name.trim(), timezone: tz, focusGoalMinutes: goal });
          await refreshSession(); // new access token carries the new name and timezone
          toast.success('Profile saved');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not save');
        }
      }}
    >
      <Field label="Name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
      <Field label="Timezone" hint="Days, streaks and reminders follow this timezone">
        {(p) => (
          <Select {...p} value={tz} onChange={(e) => setTz(e.target.value)}>
            {!zones.includes(tz) && <option value={tz}>{tz}</option>}
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={`Daily focus goal: ${goal} minutes`}>
        {(p) => (
          <input {...p} type="range" min={15} max={240} step={15} value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="w-full accent-[var(--track)]" />
        )}
      </Field>
      <Button type="submit" loading={update.isPending}>
        Save profile
      </Button>
    </form>
  );
}

function Notifications() {
  const { data: config } = useInsightsConfig();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void currentSubscription().then((s) => setEnabled(!!s));
  }, []);

  if (isNative) {
    return <p className="text-sm text-ink-soft">Habit reminders are scheduled on this phone, so they arrive even without a connection. Set a reminder time on any habit.</p>;
  }
  if (!config?.push.enabled || !config.push.vapidPublicKey) {
    return <p className="text-sm text-ink-soft">Push notifications aren't configured on this server. In-app notifications still work.</p>;
  }
  if (!pushSupported()) {
    return <p className="text-sm text-ink-soft">This browser doesn't support push notifications. On iPhone, add Trackly to your home screen first.</p>;
  }
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3">
        <Switch
          checked={enabled}
          disabled={busy}
          label="Push notifications"
          onCheckedChange={async (v) => {
            setBusy(true);
            try {
              if (v) await enablePush(config.push.vapidPublicKey!);
              else await disablePush();
              setEnabled(v);
              toast.success(v ? 'Notifications on for this browser' : 'Notifications off');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not change notifications');
            } finally {
              setBusy(false);
            }
          }}
        />
        <span className="text-sm">Habit reminders, due-soon alerts and achievements on this browser</span>
      </label>
      {enabled && (
        <Button variant="secondary" size="sm" onClick={() => void insights.post('/push/test').then(() => toast('Test notification sent'))}>
          Send a test notification
        </Button>
      )}
    </div>
  );
}

function Password() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await change.mutateAsync({ currentPassword: current, newPassword: next });
          setCurrent('');
          setNext('');
          toast.success('Password changed');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not change the password');
        }
      }}
    >
      <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
      <Field label="New password" hint="At least 8 characters">
        {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Button type="submit" variant="secondary" loading={change.isPending} disabled={!current || next.length < 8}>
        Change password
      </Button>
    </form>
  );
}

export default function Settings() {
  const theme = useTheme();
  const { data: me } = useMe();
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await core.get<unknown>('/api/v1/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trackly-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="font-display mb-6 text-5xl sm:text-6xl">Settings</h1>
      <div className="panel px-5 sm:px-8">
        <Card title="Profile" description="Your name and the timezone your days are counted in.">
          <Profile />
        </Card>
        <Card title="Appearance">
          <Segmented<ThemeChoice>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Match device' },
            ]}
          />
        </Card>
        <Card title="Notifications">
          <Notifications />
        </Card>
        {!me?.demo && (
          <Card title="Password">
            <Password />
          </Card>
        )}
        <Card title="Your data" description="Everything you've put into Trackly belongs to you.">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void exportData()} loading={exporting}>
              <Download className="size-4" /> Download my data (JSON)
            </Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Delete account
            </Button>
          </div>
        </Card>
        <Card title="About Trackly">
          <div className="flex flex-wrap gap-3 text-sm">
            <Button asChild variant="ghost" size="sm">
              <a href={GITHUB_URL}>
                <CodeXml className="size-4" /> Source code
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`${API_URL}/swagger-ui.html`}>API documentation</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={isNative ? `${GITHUB_URL}/blob/main/apps/web/public/privacy.html` : '/privacy.html'}>Privacy policy</a>
            </Button>
            {!isNative && (
              <Button asChild variant="ghost" size="sm">
                <a href={`${GITHUB_URL}/releases/latest`}>
                  <Smartphone className="size-4" /> Android app
                </a>
              </Button>
            )}
          </div>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </Button>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete your account?"
        body="All tasks, habits, goals, focus sessions and insights are permanently deleted. Download your data first if you want a copy."
        confirmLabel="Delete everything"
        danger
        onConfirm={async () => {
          await del.mutateAsync();
          await logout();
          navigate('/');
          toast('Your account was deleted');
        }}
      />
    </div>
  );
}
