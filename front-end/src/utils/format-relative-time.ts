/**
 * Formats a date as relative time (e.g., "2 hours ago", "3 days ago").
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) {
    return `just now`;
  }
  if (diffMin < 60) {
    return `${diffMin} ${diffMin === 1 ? `minute` : `minutes`} ago`;
  }
  if (diffHour < 24) {
    return `${diffHour} ${diffHour === 1 ? `hour` : `hours`} ago`;
  }
  if (diffDay < 7) {
    return `${diffDay} ${diffDay === 1 ? `day` : `days`} ago`;
  }
  if (diffWeek < 4) {
    return `${diffWeek} ${diffWeek === 1 ? `week` : `weeks`} ago`;
  }
  if (diffMonth < 12) {
    return `${diffMonth} ${diffMonth === 1 ? `month` : `months`} ago`;
  }
  return `${diffYear} ${diffYear === 1 ? `year` : `years`} ago`;
}
