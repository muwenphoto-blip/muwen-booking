const EXACT_PHRASES: Record<string, string> = {
  證件照: 'ID Photo',
  形象照: 'Profile Photo',
  證件照套組: 'ID Photo Package',
  全家福: 'Family Portrait',
  結婚登記: 'Marriage Registration',
  '畢業照／戶外寫真': 'Graduation / Outdoor Portrait',
  '畢業照/戶外寫真': 'Graduation / Outdoor Portrait',
  畢業照: 'Graduation Portrait',
  戶外寫真: 'Outdoor Portrait',
  寫真: 'Portrait',
  婚紗: 'Wedding',
  孕婦照: 'Maternity',
  寵物照: 'Pet Photography',
  團體照: 'Group Photo',
  留言問我們: 'Contact Us',
  半身: 'Half Body',
  全身: 'Full Body',
  '小家庭(4-5人)': 'Small Family (4-5 people)',
  '小家庭（4-5人）': 'Small Family (4-5 people)',
  '大家庭(5人以上)': 'Large Family (5+ people)',
  '大家庭（5人以上）': 'Large Family (5+ people)',
  '大家庭（多人組）': 'Large Group',
  '大家庭(多人組)': 'Large Group',
  '基礎型（5張精修）': 'Basic (5 retouched)',
  '基礎型(5張精修)': 'Basic (5 retouched)',
  '進階型（15張精修）': 'Advanced (15 retouched)',
  '進階型(15張精修)': 'Advanced (15 retouched)',
  全記錄: 'Full Coverage',
  '全記錄＋類婚紗': 'Full Coverage + Pre-Wedding Style',
  '全記錄+類婚紗': 'Full Coverage + Pre-Wedding Style',
  單人: 'Single',
  多人: 'Group',
  男: 'Male',
  女: 'Female',
  其他: 'Other',
  不願透露: 'Prefer Not to Say',
};

const WORD_PHRASES: Record<string, string> = {
  小家庭: 'Small Family',
  大家庭: 'Large Family',
  基礎型: 'Basic',
  進階型: 'Advanced',
  方案: 'Plan',
  類婚紗: 'Pre-Wedding Style',
  精修: 'retouched',
  張: 'photos',
  以上: 'or more',
  多人組: 'Large Group',
};

function normalizeChineseText(text: string): string {
  return String(text || '').trim().replace(/（/g, '(').replace(/）/g, ')').replace(/／/g, '/');
}

function lookupExact(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (EXACT_PHRASES[raw]) return EXACT_PHRASES[raw];
  const normalized = normalizeChineseText(raw);
  if (EXACT_PHRASES[normalized]) return EXACT_PHRASES[normalized];
  return '';
}

function translatePlanLabel(text: string): string {
  const match = text.match(/^方案\s*([A-Za-z0-9]+)$/);
  if (match) return `Plan ${match[1].toUpperCase()}`;
  return '';
}

function translateFamilySizeLabel(text: string): string {
  const match = text.match(/^(小家庭|大家庭)\(([^)]+)\)$/);
  if (!match) return '';

  const family = WORD_PHRASES[match[1]] || match[1];
  const detail = translateParenthetical(match[2]);
  return detail ? `${family} (${detail})` : family;
}

function translateRetouchPlanLabel(text: string): string {
  const match = text.match(/^(.+型)\((\d+)張精修\)$/);
  if (!match) return '';

  const tier = WORD_PHRASES[match[1]] || match[1];
  return `${tier} (${match[2]} retouched)`;
}

function translateParenthetical(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) return '';

  const rangePeople = normalized.match(/^(\d+)-(\d+)人$/);
  if (rangePeople) return `${rangePeople[1]}-${rangePeople[2]} people`;

  const minPeople = normalized.match(/^(\d+)人以上$/);
  if (minPeople) return `${minPeople[1]}+ people`;

  if (normalized === '多人組') return 'large group';

  const exact = lookupExact(normalized);
  if (exact) return exact;

  return normalized
    .replace(/(\d+)張精修/g, '$1 retouched')
    .replace(/人以上/g, '+ people')
    .replace(/(\d+)-(\d+)人/g, '$1-$2 people')
    .replace(/多人/g, 'group');
}

function translateByParts(text: string): string {
  const normalized = normalizeChineseText(text);
  if (!normalized) return '';

  const segments = normalized.split(/[、，/+＋]/).map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const translated = segments
      .map((part) => translateChineseLabel(part))
      .filter(Boolean);
    if (translated.length === segments.length) {
      return translated.join(' + ');
    }
  }

  for (const [zh, en] of Object.entries(WORD_PHRASES)) {
    if (normalized === zh) return en;
  }

  return '';
}

export function translateChineseLabel(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const exact = lookupExact(raw);
  if (exact) return exact;

  const normalized = normalizeChineseText(raw);
  const exactNormalized = lookupExact(normalized);
  if (exactNormalized) return exactNormalized;

  const plan = translatePlanLabel(normalized);
  if (plan) return plan;

  const family = translateFamilySizeLabel(normalized);
  if (family) return family;

  const retouch = translateRetouchPlanLabel(normalized);
  if (retouch) return retouch;

  const byParts = translateByParts(normalized);
  if (byParts) return byParts;

  return '';
}

export function mergeEnglishOnChineseChange(
  chinese: string,
  previousChinese: string,
  currentEnglish: string,
): string {
  const next = translateChineseLabel(chinese);
  if (!next) return currentEnglish;

  const trimmedEnglish = String(currentEnglish || '').trim();
  if (!trimmedEnglish) return next;

  const previousSuggestion = translateChineseLabel(previousChinese);
  if (previousSuggestion && trimmedEnglish === previousSuggestion) return next;

  return currentEnglish;
}

export function suggestEnglishUnlessTouched(
  chinese: string,
  currentEnglish: string,
  englishTouched: boolean,
): string {
  if (englishTouched) return currentEnglish;
  const suggested = translateChineseLabel(chinese);
  return suggested || currentEnglish;
}

export function autoFillGenderOptionsText(text: string): string {
  const lines = String(text || '').split(/\r?\n/);

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      const pipe = trimmed.indexOf('|');
      if (pipe >= 0) {
        const value = trimmed.slice(0, pipe).trim();
        const en = trimmed.slice(pipe + 1).trim();
        if (!value) return line;
        if (en) return line;
        const suggested = translateChineseLabel(value);
        return suggested ? `${value}|${suggested}` : line;
      }

      const suggested = translateChineseLabel(trimmed);
      return suggested ? `${trimmed}|${suggested}` : line;
    })
    .join('\n');
}
