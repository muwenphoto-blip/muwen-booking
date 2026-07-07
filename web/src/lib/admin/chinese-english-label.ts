const EXACT_PHRASES: Record<string, string> = {
  證件照: 'Passport & ID Photos',
  形象照: 'Professional Portraits',
  證件照套組: 'ID Photo Package',
  全家福: 'Family Portraits',
  結婚登記: 'Wedding Registry Photography',
  '畢業照／戶外寫真': 'Graduation & Outdoor Portraits',
  '畢業照/戶外寫真': 'Graduation & Outdoor Portraits',
  畢業照: 'Graduation Portraits',
  戶外寫真: 'Outdoor Portrait Sessions',
  寫真: 'Portrait Session',
  婚紗: 'Wedding',
  婚紗照: 'Wedding Photography',
  類婚紗: 'Pre-Wedding Portraits',
  孕婦照: 'Maternity Photography',
  寵物照: 'Pet Photography',
  團體照: 'Group Portraits',
  留言問我們: 'Contact Us',
  '職場套組(證件照+形象照)': 'Corporate Package (ID + Portrait Photos)',
  '職場套組（證件照+形象照）': 'Corporate Package (ID + Portrait Photos)',
  '職場套組(證件照＋形象照)': 'Corporate Package (ID + Portrait Photos)',
  職場套組: 'Corporate Headshot Package',
  半身: 'Half-Length Portraits',
  全身: 'Full-Length Portraits',
  '小家庭(4-5人)': 'Small Family (4-5 People)',
  '小家庭（4-5人）': 'Small Family (4-5 People)',
  '大家庭(5人以上)': 'Large Family (5+ People)',
  '大家庭（5人以上）': 'Large Family (5+ People)',
  '大家庭（多人組）': 'Large Group',
  '大家庭(多人組)': 'Large Group',
  '基礎型（5張精修）': 'Essential Package (5 Retouched Photos)',
  '基礎型(5張精修)': 'Essential Package (5 Retouched Photos)',
  '進階型（15張精修）': 'Premium Package (15 Retouched Photos)',
  '進階型(15張精修)': 'Premium Package (15 Retouched Photos)',
  '5張精修': '5 Retouched Photos',
  '15張精修': '15 Retouched Photos',
  全記錄: 'Full Session Coverage',
  '全記錄＋類婚紗': 'Full Coverage with Pre-Wedding Portraits',
  '全記錄+類婚紗': 'Full Coverage with Pre-Wedding Portraits',
  '全記錄＋類婚紗照': 'Full Coverage with Pre-Wedding Portraits',
  '記錄+5張形象照精修': 'Registry Session + 5 Retouched Portraits',
  '記錄＋5張形象照精修': 'Registry Session + 5 Retouched Portraits',
  記錄: 'Registry Session',
  單人: 'Individual',
  多人: 'Group',
  男: 'Male',
  女: 'Female',
  其他: 'Other',
  不願透露: 'Prefer Not to Say',
};

const SEGMENT_TERMS: Array<[string, string]> = [
  ['證件照套組', 'ID Photo Package'],
  ['形象照精修', 'Retouched Profile Photos'],
  ['形象照', 'Profile Photo'],
  ['證件照', 'ID Photo'],
  ['結婚登記', 'Marriage Registration'],
  ['職場套組', 'Workplace Package'],
  ['全記錄', 'Full Coverage'],
  ['類婚紗照', 'Pre-Wedding Style'],
  ['類婚紗', 'Pre-Wedding Style'],
  ['戶外寫真', 'Outdoor Portrait'],
  ['畢業照', 'Graduation Portrait'],
  ['全家福', 'Family Photo'],
  ['孕婦照', 'Maternity'],
  ['寵物照', 'Pet Photography'],
  ['團體照', 'Group Photo'],
  ['婚紗照', 'Wedding Photography'],
  ['小家庭', 'Small Family'],
  ['大家庭', 'Large Family'],
  ['基礎型', 'Basic'],
  ['進階型', 'Advanced'],
  ['精修', 'retouched'],
  ['套組', 'Package'],
  ['記錄', 'Record'],
  ['寫真', 'Portrait'],
  ['婚紗', 'Wedding'],
  ['職場', 'Workplace'],
  ['登記', 'Registration'],
  ['方案', 'Plan'],
  ['半身', 'Half Body'],
  ['全身', 'Full Body'],
  ['單人', 'Single'],
  ['多人', 'Group'],
];

function normalizeChineseText(text: string): string {
  return String(text || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/／/g, '/')
    .replace(/＋/g, '+');
}

function lookupExact(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (EXACT_PHRASES[raw]) return EXACT_PHRASES[raw];
  const normalized = normalizeChineseText(raw);
  if (EXACT_PHRASES[normalized]) return EXACT_PHRASES[normalized];
  return '';
}

function translateNumericPatterns(text: string): string {
  const normalized = normalizeChineseText(text);
  if (!normalized) return '';

  const profileRetouch = normalized.match(/^(\d+)張形象照精修$/);
  if (profileRetouch) return `${profileRetouch[1]} Retouched Profile Photos`;

  const retouchOnly = normalized.match(/^(\d+)張精修$/);
  if (retouchOnly) return `${retouchOnly[1]} Retouched Photos`;

  const profileCount = normalized.match(/^(\d+)張形象照$/);
  if (profileCount) return `${profileCount[1]} Profile Photos`;

  const photoCount = normalized.match(/^(\d+)張$/);
  if (photoCount) return `${photoCount[1]} Photos`;

  return '';
}

function translateSegment(text: string): string {
  const exact = lookupExact(text);
  if (exact) return exact;

  const numeric = translateNumericPatterns(text);
  if (numeric) return numeric;

  const normalized = normalizeChineseText(text);
  if (!normalized) return '';

  for (const [zh, en] of SEGMENT_TERMS) {
    if (normalized === zh) return en;
  }

  return '';
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

  const segment = translateSegment(normalized);
  if (segment) return segment;

  return normalized
    .replace(/(\d+)張形象照精修/g, '$1 retouched profile photos')
    .replace(/(\d+)張精修/g, '$1 retouched photos')
    .replace(/(\d+)張形象照/g, '$1 profile photos')
    .replace(/人以上/g, '+ people')
    .replace(/(\d+)-(\d+)人/g, '$1-$2 people')
    .replace(/多人/g, 'group');
}

function translatePlanLabel(text: string): string {
  const match = text.match(/^方案\s*([A-Za-z0-9]+)$/);
  if (match) return `Plan ${match[1].toUpperCase()}`;
  return '';
}

function translateFamilySizeLabel(text: string): string {
  const match = text.match(/^(小家庭|大家庭)\(([^)]+)\)$/);
  if (!match) return '';

  const family = translateSegment(match[1]) || match[1];
  const detail = translateParenthetical(match[2]);
  return detail ? `${family} (${detail})` : family;
}

function translateRetouchPlanLabel(text: string): string {
  const match = text.match(/^(.+型)\((\d+)張精修\)$/);
  if (!match) return '';

  const tier = translateSegment(match[1]) || match[1];
  return `${tier} (${match[2]} retouched)`;
}

function translateWrappedLabel(text: string): string {
  const normalized = normalizeChineseText(text);
  const match = normalized.match(/^(.+)\((.+)\)$/);
  if (!match) return '';

  const outer = translateSegment(match[1]) || translateChineseLabelLocally(match[1]);
  const innerParts = match[2].split(/[+]/).map((part) => part.trim()).filter(Boolean);
  const innerTranslated = innerParts
    .map((part) => translateChineseLabelLocally(part) || translateSegment(part) || translateNumericPatterns(part))
    .filter(Boolean);

  if (outer && innerTranslated.length === innerParts.length) {
    return `${outer} (${innerTranslated.join(' + ')})`;
  }

  return '';
}

function translatePlusSeparatedLabel(text: string): string {
  const normalized = normalizeChineseText(text);
  if (!normalized.includes('+')) return '';

  const parts = normalized.split(/[+]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return '';

  const translated = parts.map((part) => {
    const exact = lookupExact(part);
    if (exact) return exact;
    const numeric = translateNumericPatterns(part);
    if (numeric) return numeric;
    const segment = translateSegment(part);
    if (segment) return segment;
    return translateChineseLabelLocally(part);
  });

  if (translated.some((part) => !part)) return '';
  return translated.join(' + ');
}

function translateByParts(text: string): string {
  const normalized = normalizeChineseText(text);
  if (!normalized) return '';

  const segments = normalized.split(/[、，]/).map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const translated = segments.map((part) => translateChineseLabelLocally(part)).filter(Boolean);
    if (translated.length === segments.length) {
      return translated.join(', ');
    }
  }

  return '';
}

export function lookupCuratedEnglish(text: string): string {
  return lookupExact(text);
}

export function translateChineseLabelLocally(text: string): string {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const exact = lookupExact(raw);
  if (exact) return exact;

  const normalized = normalizeChineseText(raw);
  const exactNormalized = lookupExact(normalized);
  if (exactNormalized) return exactNormalized;

  const numeric = translateNumericPatterns(normalized);
  if (numeric) return numeric;

  const plan = translatePlanLabel(normalized);
  if (plan) return plan;

  const family = translateFamilySizeLabel(normalized);
  if (family) return family;

  const retouch = translateRetouchPlanLabel(normalized);
  if (retouch) return retouch;

  const wrapped = translateWrappedLabel(normalized);
  if (wrapped) return wrapped;

  const plusSeparated = translatePlusSeparatedLabel(normalized);
  if (plusSeparated) return plusSeparated;

  const byParts = translateByParts(normalized);
  if (byParts) return byParts;

  const segment = translateSegment(normalized);
  if (segment) return segment;

  return '';
}

export function translateChineseLabel(text: string): string {
  return translateChineseLabelLocally(text);
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
  const suggested = translateChineseLabel(chinese);
  if (!suggested) return currentEnglish;

  const trimmed = String(currentEnglish || '').trim();
  if (!trimmed) return suggested;
  if (!englishTouched) return suggested;
  return currentEnglish;
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
