import { describe, expect, it } from 'vitest';
import type { Project } from '@/api/types';
import { parseQuickAdd } from '@/lib/quickAdd';

// Thursday 29 Oct 2026, 10:00 local time
const NOW = new Date(2026, 9, 29, 10, 0, 0);
const projects: Project[] = [
  { id: 'p1', name: 'Work', color: '#000', archived: false, createdAt: '' },
  { id: 'p2', name: 'Side project', color: '#000', archived: false, createdAt: '' },
];

describe('parseQuickAdd', () => {
  it('extracts date, tags, priority, project and estimate', () => {
    const t = parseQuickAdd('Send invoice friday 5pm #Finance !high @Work ~30m', projects, NOW);
    expect(t.title).toBe('Send invoice');
    expect(t.tags).toEqual(['finance']);
    expect(t.priority).toBe('HIGH');
    expect(t.projectId).toBe('p1');
    expect(t.estimateMinutes).toBe(30);
    const due = new Date(t.dueAt!);
    expect(due.getDay()).toBe(5);
    expect(due.getHours()).toBe(17);
  });

  it('defaults a date without a time to the end of the working day', () => {
    const t = parseQuickAdd('Call mom tomorrow', [], NOW);
    expect(t.title).toBe('Call mom');
    const due = new Date(t.dueAt!);
    expect(due.getDate()).toBe(30);
    expect(due.getHours()).toBe(18);
  });

  it('understands recurrence and gives it a first due date', () => {
    const t = parseQuickAdd('Stand-up notes every weekday', [], NOW);
    expect(t.recurrence).toBe('WEEKDAYS');
    expect(t.title).toBe('Stand-up notes');
    expect(t.dueAt).toBeTruthy();
  });

  it('prefers the longest matching project name', () => {
    const t = parseQuickAdd('Write README @Side project', projects, NOW);
    expect(t.projectId).toBe('p2');
    expect(t.title).toBe('Write README');
  });

  it('leaves plain text alone', () => {
    const t = parseQuickAdd('Buy milk', projects, NOW);
    expect(t).toMatchObject({ title: 'Buy milk', tokens: [] });
    expect(t.dueAt).toBeUndefined();
  });

  it('accepts numeric priorities', () => {
    expect(parseQuickAdd('Fix prod !1', [], NOW).priority).toBe('URGENT');
  });
});
