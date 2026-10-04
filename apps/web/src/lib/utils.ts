import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

/** "in 5 days" / "2 days ago" */
export function formatRelative(date: string | Date) {
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(days, 'day');
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
