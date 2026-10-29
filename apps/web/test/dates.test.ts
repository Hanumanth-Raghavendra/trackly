import { describe, expect, it } from 'vitest';
import { dueLabel } from '@/lib/dates';
import { flushQueue, pending, queueTask } from '@/lib/offlineQueue';

const NOW = new Date(2026, 9, 29, 12, 0, 0); // Thu 29 Oct 2026, noon

describe('dueLabel', () => {
  it('labels overdue, today, tomorrow and later', () => {
    expect(dueLabel(new Date(2026, 9, 27, 18).toISOString(), NOW)).toEqual({ text: '2 days late', tone: 'overdue' });
    expect(dueLabel(new Date(2026, 9, 29, 9).toISOString(), NOW)?.tone).toBe('overdue');
    expect(dueLabel(new Date(2026, 9, 29, 18).toISOString(), NOW)).toEqual({ text: 'Today 6 PM', tone: 'today' });
    expect(dueLabel(new Date(2026, 9, 30, 9, 30).toISOString(), NOW)).toEqual({ text: 'Tomorrow 9:30 AM', tone: 'soon' });
    expect(dueLabel(new Date(2026, 10, 20).toISOString(), NOW)?.tone).toBe('later');
    expect(dueLabel(null, NOW)).toBeNull();
  });
});

describe('offline queue', () => {
  it('keeps tasks that fail to send and drops the ones that succeed', async () => {
    localStorage.clear();
    queueTask({ title: 'A' });
    queueTask({ title: 'B' });
    const sent = await flushQueue(async (t) => {
      if (t.title === 'B') throw new Error('still offline');
    });
    expect(sent).toBe(1);
    expect(pending().map((t) => t.title)).toEqual(['B']);
  });
});
