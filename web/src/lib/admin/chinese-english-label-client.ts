import { translateChineseLabelLocally } from '@/lib/admin/chinese-english-label';
import type { EnglishLabelContext } from '@/lib/admin/english-label-translator';

const clientCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(text: string, context: EnglishLabelContext): string {
  return `${context}:${text.trim()}`;
}

export function getLocalEnglishLabel(text: string): string {
  return translateChineseLabelLocally(text);
}

export async function fetchEnglishLabelSuggestion(
  text: string,
  context: EnglishLabelContext,
): Promise<string> {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const key = cacheKey(trimmed, context);
  const cached = clientCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetch('/api/admin/translate-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, context }),
      });
      const data = await res.json();
      if (res.ok && data.translation) {
        clientCache.set(key, data.translation);
        return String(data.translation);
      }
    } catch {
      // fall through to local dictionary
    }

    const local = getLocalEnglishLabel(trimmed);
    if (local) clientCache.set(key, local);
    return local;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}
