import { looksLikeInternship } from '../internship.js';

/** Fetch JSON with a hard timeout. Returns null on any failure (probe-friendly). */
export async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'RecruiterPro/1.0' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function classifyTitle(title: string): 'internship' | null {
  return looksLikeInternship(title) ? 'internship' : null;
}
