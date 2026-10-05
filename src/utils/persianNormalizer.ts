/**
 * Conservative Persian text preparation for Piper/eSpeak phonemization.
 * It preserves the user's wording, normalizes Arabic variants and adds only
 * pronunciation hints that are stable across the bundled Persian models.
 */

const PRONUNCIATION_MAP: Record<string, string> = {
  'ندای شیروخورشید': 'نِدایِ شیر و خُرشید',
  'شیروخورشید': 'شیر و خُرشید',
  'شیر و خورشید': 'شیر و خُرشید',
  'هوش مصنوعی': 'هوشِ مَصنوعی',
  'آوا استودیو': 'آوا اِستودیو',
  'آوااستودیو': 'آوا اِستودیو',
  'آذربایجان': 'آذَربایجان',
  'اصفهان': 'اِصفهان',
  'تهران': 'تِهران',
  'مشهد': 'مَشهد',
  'تبریز': 'تَبریز',
  'کرمانشاه': 'کِرمانشاه',
  'کردستان': 'کُردستان',
  'خوزستان': 'خوزِستان',
  'سرزمین': 'سَرزَمین',
  'سرچشمه': 'سَرچِشمِه',
  'پرگهر': 'پُرگوهَر',
  'فرهنگ': 'فَرهَنگ',
  'تمدن': 'تَمَدُّن',
  'فناوری': 'فَناوَری',
  'کشور': 'کِشوَر',
  'مردم': 'مَردُم',
  'گوینده': 'گویَندِه',
  'داستان': 'داستان',
  'امروز': 'اِمروز',
  'فردا': 'فَردا',
  'زندگی': 'زِندِگی',
  'مهربانی': 'مِهرَبانی',
  'موفقیت': 'مُوَفَّقیَّت',
  'آینده': 'آیَندِه',
  'خورشید': 'خُرشید',
  'ستاره': 'سِتارِه',
  'آسمان': 'آسِمان',
  'زمین': 'زَمین',
  'شاهنامه': 'شاهنامِه',
  'فردوسی': 'فِردُوسی',
  'می‌شود': 'می‌شَوَد',
  'می‌کند': 'می‌کُنَد',
  'می‌گوید': 'می‌گویَد',
  'برای': 'بَرایِ',
  'شما': 'شُما',
  'من': 'مَن',
};

const NUMBER_WORDS: Record<string, string> = {
  '0': 'صِفر',
  '1': 'یِک',
  '2': 'دو',
  '3': 'سِه',
  '4': 'چَهار',
  '5': 'پَنج',
  '6': 'شِش',
  '7': 'هَفت',
  '8': 'هَشت',
  '9': 'نُه',
  '10': 'دَه',
  '11': 'یازْدَه',
  '12': 'دَوازْدَه',
  '13': 'سیزْدَه',
  '14': 'چَهارْدَه',
  '15': 'پانزْدَه',
  '16': 'شانزْدَه',
  '17': 'هِفدَه',
  '18': 'هِجدَه',
  '19': 'نوزْدَه',
  '20': 'بیست',
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const WORD_BOUNDARY = '[\\s،؛.!؟!…«»()\\[\\]{}]';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWholePhrase(text: string, phrase: string, replacement: string) {
  const expression = new RegExp(`(^|${WORD_BOUNDARY})${escapeRegExp(phrase)}(?=$|${WORD_BOUNDARY})`, 'gu');
  return text.replace(expression, (_match, prefix: string) => `${prefix}${replacement}`);
}

function expandSimpleNumbers(text: string) {
  return text.replace(/(^|[^0-9])(\d{1,2})(?=$|[^0-9])/g, (match, prefix: string, number: string) => {
    return `${prefix}${NUMBER_WORDS[number] || number}`;
  });
}

/** پاک‌سازی و استانداردسازی متن فارسی برای خوانش طبیعی گفتار. */
export function normalizePersianText(text: string): string {
  if (!text) return '';

  let output = text
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه‌ی')
    .replace(/\u200c+/g, '\u200c')
    .replace(/[ـ]+/g, '')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/\.{3,}/g, '…')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*([،؛؟!])\s*/g, '$1 ')
    .replace(/\s*([.…])\s*/g, '$1 ')
    .trim();

  output = expandSimpleNumbers(output);

  // Longer phrases must be handled first so a shorter entry cannot overwrite them.
  for (const [phrase, spoken] of Object.entries(PRONUNCIATION_MAP).sort(
    ([left], [right]) => right.length - left.length
  )) {
    output = replaceWholePhrase(output, phrase, spoken);
  }

  return output.replace(/\s+/g, ' ').trim();
}
