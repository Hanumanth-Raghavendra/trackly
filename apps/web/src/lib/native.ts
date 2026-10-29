import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Habit, Weekday } from '@/api/types';
import { isNative } from './platform';

/** Android back button: go back in history, or leave the app from the home screen. */
export async function initNative() {
  if (!isNative) return;
  await CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== '/app/today') window.history.back();
    else void CapApp.exitApp();
  });
}

const WEEKDAY_NUM: Record<Weekday, number> = {
  SUNDAY: 1,
  MONDAY: 2,
  TUESDAY: 3,
  WEDNESDAY: 4,
  THURSDAY: 5,
  FRIDAY: 6,
  SATURDAY: 7,
};

/**
 * On Android, habit reminders are scheduled ON THE DEVICE as repeating local notifications.
 * They fire even when the free-tier server is asleep and cost nothing.
 */
export async function syncHabitReminders(habits: Habit[]) {
  if (!isNative) return;
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') {
    const req = await LocalNotifications.requestPermissions();
    if (req.display !== 'granted') return;
  }
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });

  const notifications = [];
  let id = 1000;
  for (const h of habits) {
    if (!h.reminderTime || h.archived) continue;
    const [hour, minute] = h.reminderTime.split(':').map(Number);
    const days = h.frequencyType === 'SPECIFIC_DAYS' ? h.daysOfWeek : (Object.keys(WEEKDAY_NUM) as Weekday[]);
    for (const d of days) {
      notifications.push({
        id: id++,
        title: `${h.icon} Time for ${h.name}`,
        body: 'A quick check-in keeps your streak alive.',
        schedule: { on: { weekday: WEEKDAY_NUM[d], hour, minute }, allowWhileIdle: true },
        extra: { habitId: h.id },
      });
    }
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/** Focus timer end alert on the device. */
export async function scheduleFocusEnd(at: Date, title: string) {
  if (!isNative) return;
  await LocalNotifications.schedule({
    notifications: [{ id: 42, title, body: 'Take a short break, then go again.', schedule: { at, allowWhileIdle: true } }],
  });
}

export async function cancelFocusEnd() {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: 42 }] });
}
