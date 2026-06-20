/**
 * Pure helper functions for Provider Analytics (Sprint 4.1).
 * No database interaction. No side effects.
 */

export interface MonthlyTrends {
  profileViews: number;
  bookingRequests: number;
  completedJobs: number;
}

export interface TopService {
  name: string;
  bookings: number;
}

export interface RepeatCustomerData {
  count: number;
  rate: number; // 0-100
}

export interface PeakHourRange {
  label: string;
  bookings: number;
}

export interface ActiveDay {
  name: string;
  bookings: number;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${ampm}`;
}

function formatHourRange(start: number, end: number): string {
  if (start === end) return formatHour(start);
  return `${formatHour(start)}–${formatHour(end)}`;
}

/** Compute start and end ISO strings for current calendar month. */
export function getCurrentMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  return { start, end };
}

/** Aggregate top 5 services by booking count. */
export function computeTopServices(
  bookings: Array<{ service_id: string | null; services: { name: string } | null }>,
): TopService[] {
  const counts: Record<string, number> = {};
  bookings.forEach((b) => {
    const name = b.services?.name ?? 'Unknown Service';
    counts[name] = (counts[name] ?? 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, bookings]) => ({ name, bookings }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 5);
}

/** Compute repeat customer count and rate from completed bookings. */
export function computeRepeatCustomers(
  bookings: Array<{ customer_id: string }>,
): RepeatCustomerData {
  const customerCounts: Record<string, number> = {};
  bookings.forEach((b) => {
    customerCounts[b.customer_id] = (customerCounts[b.customer_id] ?? 0) + 1;
  });
  const totalUnique = Object.keys(customerCounts).length;
  const repeatCount = Object.values(customerCounts).filter((c) => c >= 2).length;
  const rate = totalUnique > 0 ? Math.round((repeatCount / totalUnique) * 100) : 0;
  return { count: repeatCount, rate };
}

/** Compute top 3 peak hour ranges from completed booking timestamps. */
export function computePeakHours(
  bookings: Array<{ created_at: string }>,
): PeakHourRange[] {
  const hourCounts = new Array(24).fill(0);
  bookings.forEach((b) => {
    const hour = new Date(b.created_at).getHours();
    hourCounts[hour] += 1;
  });

  // Build list of [hour, count] and sort by count desc
  const hoursWithCount = hourCounts
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count);

  if (hoursWithCount.length === 0) return [];

  // Take top hours, merge consecutive ones into ranges
  const topHours = new Set(hoursWithCount.slice(0, 6).map((h) => h.hour));
  const ranges: { start: number; end: number; bookings: number }[] = [];
  const processed = new Set<number>();

  for (const h of hoursWithCount.slice(0, 6)) {
    if (processed.has(h.hour)) continue;
    let start = h.hour;
    let end = h.hour;
    let total = hourCounts[h.hour];
    processed.add(h.hour);

    // Expand forward while next hour is also a top hour
    while (topHours.has(end + 1) && !processed.has(end + 1)) {
      end += 1;
      total += hourCounts[end];
      processed.add(end);
    }
    // Expand backward while prev hour is also a top hour
    while (topHours.has(start - 1) && !processed.has(start - 1)) {
      start -= 1;
      total += hourCounts[start];
      processed.add(start);
    }

    ranges.push({ start, end, bookings: total });
  }

  // Sort ranges by total bookings desc, take top 3
  return ranges
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 3)
    .map((r) => ({
      label: formatHourRange(r.start, r.end + 1),
      bookings: r.bookings,
    }));
}

/** Compute top 3 most active weekdays from completed booking timestamps. */
export function computeActiveDays(
  bookings: Array<{ created_at: string }>,
): ActiveDay[] {
  const dayCounts = new Array(7).fill(0);
  bookings.forEach((b) => {
    const dow = new Date(b.created_at).getDay();
    dayCounts[dow] += 1;
  });

  return dayCounts
    .map((bookings, idx) => ({ name: WEEKDAY_NAMES[idx], bookings }))
    .filter((d) => d.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 3);
}

/** Generate friendly insights based on existing metrics. */
export function generateInsights(metrics: {
  profileViews: number;
  completedJobs: number;
  totalReviews: number;
  averageRating: number;
  averageResponseMinutes: number;
  conversionRate: number;
  repeatRate: number;
}): string[] {
  const msgs: string[] = [];

  if (metrics.profileViews < 50) {
    msgs.push('Increase visibility by becoming a Featured Provider.');
  }
  if (metrics.conversionRate > 20) {
    msgs.push('Your profile converts visitors into customers very effectively.');
  }
  if (metrics.repeatRate > 30) {
    msgs.push('You have strong customer loyalty.');
  }
  if (metrics.averageResponseMinutes > 0 && metrics.averageResponseMinutes < 30) {
    msgs.push('Customers appreciate your quick replies.');
  }
  if (metrics.totalReviews < 5 && metrics.completedJobs >= 3) {
    msgs.push('Encourage satisfied customers to leave reviews.');
  }
  if (metrics.averageRating >= 4.5 && metrics.totalReviews >= 5) {
    msgs.push('Your excellent rating helps attract new customers.');
  }
  if (metrics.completedJobs >= 10 && metrics.averageRating >= 4.0 && metrics.repeatRate < 20) {
    msgs.push('Consider follow-up offers to turn one-time customers into repeat clients.');
  }

  return msgs;
}

/** Generate dashboard-specific insights from loaded data (read-only computation). */
export function generateDashboardInsights(params: {
  recentBookings: Array<{ status: string; created_at: string; service?: { name: string } | null }>;
  providerRating: number;
  totalReviews: number;
  completedJobs: number;
  profileViews: number;
  responseRate: number;
}): string[] {
  const msgs: string[] = [];
  const { recentBookings, providerRating, totalReviews, completedJobs, profileViews, responseRate } = params;

  // Day-of-week insight
  const dayCounts = new Array(7).fill(0);
  recentBookings.forEach((b) => {
    if (b.status === 'completed') {
      dayCounts[new Date(b.created_at).getDay()] += 1;
    }
  });
  const topDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  if (topDayIdx >= 0 && dayCounts[topDayIdx] > 1) {
    msgs.push(`${WEEKDAY_NAMES[topDayIdx]} generates the most bookings for you.`);
  }

  // Service popularity insight
  const serviceCounts: Record<string, number> = {};
  recentBookings.forEach((b) => {
    const name = b.service?.name ?? 'Unknown';
    serviceCounts[name] = (serviceCounts[name] ?? 0) + 1;
  });
  const topService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0];
  if (topService && topService[1] >= 2) {
    const total = recentBookings.length;
    const pct = Math.round((topService[1] / total) * 100);
    msgs.push(`${topService[0]} accounts for ${pct}% of your recent bookings.`);
  }

  // Rating insight
  if (providerRating >= 4.8 && totalReviews >= 10) {
    msgs.push('Your rating is in the top tier — a strong competitive advantage.');
  } else if (providerRating >= 4.5 && totalReviews >= 5) {
    msgs.push('Your rating is excellent. Keep delivering great service.');
  }

  // Volume insight
  if (completedJobs >= 50) {
    msgs.push('You have completed 50+ jobs — a milestone that builds trust.');
  } else if (completedJobs >= 20) {
    msgs.push('Your growing experience is reflected in customer satisfaction.');
  }

  // Visibility insight
  if (profileViews >= 100) {
    msgs.push('Your profile is getting strong visibility.');
  } else if (profileViews > 0 && profileViews < 30) {
    msgs.push('Featured status can significantly increase your profile views.');
  }

  // Response rate insight
  if (responseRate >= 0.95) {
    msgs.push('Your response rate is outstanding — customers value reliability.');
  } else if (responseRate > 0 && responseRate < 0.7) {
    msgs.push('Improving your response rate can boost customer confidence.');
  }

  return msgs;
}
