import { lookupCuratedEnglish, translateChineseLabelLocally } from '@/lib/admin/chinese-english-label';

export type EnglishLabelContext = 'service' | 'option' | 'gender';

const translationCache = new Map<string, string>();

function cacheKey(text: string, context: EnglishLabelContext): string {
  return `${context}:${text.trim()}`;
}

function polishEnglishLabel(text: string): string {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/g, '');
}

function contextHint(context: EnglishLabelContext): string {
  if (context === 'service') {
    return 'Photography studio service name for booking website. Use natural American English, not word-for-word translation.';
  }
  if (context === 'option') {
    return 'Photography package option name. Use natural American English suitable for a price list.';
  }
  return 'Form option label. Use natural American English.';
}

async function translateWithDeepL(text: string, context: EnglishLabelContext): Promise<string> {
  const apiKey = String(process.env.DEEPL_API_KEY || '').trim();
  if (!apiKey) return '';

  const targetLang = String(process.env.DEEPL_TARGET_LANG || 'EN-US').trim() || 'EN-US';
  const params = new URLSearchParams({
    text,
    source_lang: 'ZH',
    target_lang: targetLang,
  });
  const contextText = contextHint(context);
  if (contextText) params.set('context', contextText);

  const endpoint = apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  async function requestTranslation(body: URLSearchParams) {
    return fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });
  }

  let res = await requestTranslation(params);
  if (!res.ok && params.has('context')) {
    params.delete('context');
    res = await requestTranslation(params);
  }

  if (!res.ok) return '';

  const data = (await res.json()) as { translations?: { text?: string }[] };
  return polishEnglishLabel(data.translations?.[0]?.text || '');
}

async function translateWithMyMemory(text: string): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', 'zh-TW|en-US');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return '';

  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    matches?: { translation?: string; match?: number }[];
  };

  const direct = polishEnglishLabel(data.responseData?.translatedText || '');
  if (direct && direct.toUpperCase() !== text.toUpperCase()) return direct;

  const best = data.matches
    ?.map((item) => polishEnglishLabel(item.translation || ''))
    .find((item) => item && item.toUpperCase() !== text.toUpperCase());

  return best || '';
}

export async function translateEnglishLabel(
  text: string,
  context: EnglishLabelContext = 'service',
): Promise<string> {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const key = cacheKey(trimmed, context);
  const cached = translationCache.get(key);
  if (cached) return cached;

  const curated = lookupCuratedEnglish(trimmed);
  if (curated) {
    translationCache.set(key, curated);
    return curated;
  }

  const deepl = await translateWithDeepL(trimmed, context);
  if (deepl) {
    translationCache.set(key, deepl);
    return deepl;
  }

  const myMemory = await translateWithMyMemory(trimmed);
  if (myMemory) {
    translationCache.set(key, myMemory);
    return myMemory;
  }

  const local = polishEnglishLabel(translateChineseLabelLocally(trimmed));
  if (local) {
    translationCache.set(key, local);
    return local;
  }

  return '';
}
