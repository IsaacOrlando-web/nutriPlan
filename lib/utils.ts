import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sets a cookie readable by middleware and server components. */
export function setCookie(name: string, value: string, maxAgeDays = 365): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeDays * 86400}; samesite=lax`;
}

export function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWholeFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("en-US");

export function fmtUsd(n: number, whole = false): string {
  return (whole ? usdWholeFormatter : usdFormatter).format(n);
}

export function fmtNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return options ? new Intl.NumberFormat("en-US", options).format(n) : numberFormatter.format(n);
}

export function fmtDate(date: Date | string, options: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date.length === 10 ? `${date}T12:00:00` : date) : date;
  return new Intl.DateTimeFormat("en-US", options).format(d);
}

/** "3 hours ago", "yesterday", "in 2 days". */
export function fmtRelative(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return fmtDate(d, { month: "short", day: "numeric" });
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
