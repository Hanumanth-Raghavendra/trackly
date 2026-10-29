import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayRange,
  formatHour,
  isValidTimeZone,
  localParts,
  safeZone,
  setDatabaseZones,
  weekStart,
  weekdayOf,
} from '../../src/domain/dates.js';

describe('dates', () => {
  it('converts an instant to the local calendar day and hour', () => {
    // 20:00 UTC is 01:30 the next day in India.
    const p = localParts(new Date('2026-10-29T20:00:00Z'), 'Asia/Kolkata');
    expect(p).toMatchObject({ date: '2026-10-30', hour: 1, minute: 30, weekday: 5 });
  });

  it('does calendar arithmetic across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('finds the Monday of a week', () => {
    expect(weekdayOf('2026-10-29')).toBe(4);
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the same week
  });

  it('builds inclusive ranges', () => {
    expect(dayRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('validates time zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(safeZone(undefined)).toBe('UTC');
  });

  it('maps legacy zone names browsers still send', () => {
    expect(safeZone('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(safeZone(' Europe/Kiev ')).toBe('Europe/Kyiv');
    expect(safeZone('America/New_York')).toBe('America/New_York');
  });

  it('falls back to UTC for zones the database does not know', () => {
    setDatabaseZones(['UTC', 'Asia/Kolkata']);
    try {
      expect(safeZone('Asia/Calcutta')).toBe('Asia/Kolkata');
      expect(safeZone('America/New_York')).toBe('UTC');
    } finally {
      setDatabaseZones(null);
    }
  });

  it('formats hours for humans', () => {
    expect([0, 9, 12, 15].map(formatHour)).toEqual(['12 AM', '9 AM', '12 PM', '3 PM']);
  });
});
