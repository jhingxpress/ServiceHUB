import { Availability } from '../types';

/**
 * Database convention (matches ScheduleScreen DAYS.indexOf):
 * 0 = Monday, 1 = Tuesday, 2 = Wednesday, 3 = Thursday,
 * 4 = Friday, 5 = Saturday, 6 = Sunday
 *
 * JS getDay() convention:
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function jsDayToDbDay(jsDay: number): number {
  // Convert JS getDay() (Sun=0) to DB day_of_week (Mon=0)
  return (jsDay + 6) % 7;
}

function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number);
  return { h, m };
}

function minutesFromMidnight(t: string): number {
  const { h, m } = parseTime(t);
  return h * 60 + m;
}

function formatTime12h(t: string): string {
  const { h, m } = parseTime(t);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${displayH}${displayM} ${ampm}`;
}

function is24Hour(start: string, end: string): boolean {
  const span = minutesFromMidnight(end) - minutesFromMidnight(start);
  return span >= 23 * 60 + 30; // 23.5+ hours
}

export interface OpenStatus {
  isOpen: boolean;
  label: string;
  subLabel: string;
  color: string; // hex color for dot/badge
}

/**
 * Compute whether a provider is currently open based on their weekly schedule.
 *
 * Cases handled:
 * 1. Currently inside today's schedule → "Open Now / Until 6:00 PM"
 * 2. After closing today → "Closed / Opens Monday at 7:00 AM"
 * 3. Today not scheduled   → "Closed / Opens Monday at 7:00 AM"
 * 4. 24-hour provider      → "Open 24 Hours"
 * 5. Overnight schedule    → "Open Now / Until 6:00 AM"
 * 6. No schedule set       → "Availability not specified / Book anytime"
 *
 * @param schedule - availability rows for a single provider
 * @returns OpenStatus for UI display
 */
export function getProviderOpenStatus(schedule: Availability[]): OpenStatus {
  if (!schedule || schedule.length === 0) {
    return { isOpen: true, label: 'Availability not specified', subLabel: 'Book anytime', color: '#F59E0B' };
  }

  // Sort by day_of_week for consistent next-day lookup
  const sorted = [...schedule]
    .filter((s) => s.is_available)
    .sort((a, b) => a.day_of_week - b.day_of_week);

  if (sorted.length === 0) {
    return { isOpen: true, label: 'Availability not specified', subLabel: 'Book anytime', color: '#F59E0B' };
  }

  const now = new Date();
  const todayDow = jsDayToDbDay(now.getDay());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Find today's schedule row
  const todayRow = sorted.find((s) => s.day_of_week === todayDow);

  if (todayRow) {
    const startMin = minutesFromMidnight(todayRow.start_time);
    const endMin = minutesFromMidnight(todayRow.end_time);

    if (is24Hour(todayRow.start_time, todayRow.end_time)) {
      return { isOpen: true, label: 'Open 24 Hours', subLabel: '', color: '#10B981' };
    }

    const overnight = endMin < startMin;

    if (overnight) {
      // Open from start_time through midnight until end_time
      if (nowMinutes >= startMin || nowMinutes < endMin) {
        return {
          isOpen: true,
          label: 'Open Now',
          subLabel: `Until ${formatTime12h(todayRow.end_time)}`,
          color: '#10B981',
        };
      }
      // Closed — after overnight window ended
      const next = findNextOpenDay(sorted, todayDow);
      return {
        isOpen: false,
        label: 'Closed',
        subLabel: next
          ? `Opens ${next.dayName} at ${formatTime12h(next.start_time)}`
          : 'No upcoming schedule',
        color: '#EF4444',
      };
    }

    // Normal same-day schedule
    if (nowMinutes >= startMin && nowMinutes < endMin) {
      return {
        isOpen: true,
        label: 'Open Now',
        subLabel: `Until ${formatTime12h(todayRow.end_time)}`,
        color: '#10B981',
      };
    }

    // After closing today
    const next = findNextOpenDay(sorted, todayDow);
    return {
      isOpen: false,
      label: 'Closed',
      subLabel: next
        ? `Opens ${next.dayName} at ${formatTime12h(next.start_time)}`
        : 'No upcoming schedule',
      color: '#EF4444',
    };
  }

  // Today not in schedule at all
  const next = findNextOpenDay(sorted, todayDow);
  return {
    isOpen: false,
    label: 'Closed',
    subLabel: next
      ? `Opens ${next.dayName} at ${formatTime12h(next.start_time)}`
      : 'No upcoming schedule',
    color: '#EF4444',
  };
}

function findNextOpenDay(
  sorted: Availability[],
  fromDow: number,
): { dayName: string; start_time: string } | null {
  // Look forward from tomorrow
  for (let offset = 1; offset <= 7; offset++) {
    const dow = (fromDow + offset) % 7;
    const row = sorted.find((s) => s.day_of_week === dow);
    if (row) {
      return { dayName: DAY_NAMES[dow], start_time: row.start_time };
    }
  }
  return null;
}
