/**
 * فرهنگ واژگان و اعراب‌گذاری آوایی برگرفته از AwaStudioiran-offline
 */
const PRONUNCIATION_MAP: Record<string, string> = {
  'ایران': 'ایران',
  'تهران': 'تِهران',
  'آذربایجان': 'آذَربایجان',
  'اصفهان': 'اِصفهان',
  'شیراز': 'شیراز',
  'مشهد': 'مَشهد',
  'تبریز': 'تَبریز',
  'کرمانشاه': 'کِرمانشاه',
  'کردستان': 'کُردستان',
  'خوزستان': 'خوزِستان',
  'فناوری': 'فَناوَری',
  'هوش مصنوعی': 'هوشِ مَصنوعی',
  'کشور': 'کِشوَر',
  'مردم': 'مَردُم',
  'شیر و خورشید': 'شیرو خورشید',
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * پاک‌سازی و استانداردسازی متن فارسی جهت خوانش طبیعی گفتار
 */
export function normalizePersianText(text: string): string {
  if (!text) return '';

  let out = text
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'هٔ')
    .replace(/\u200c+/g, '\u200c')
    .replace(/[ـ]+/g, '')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *([،؛؟!]) */g, '$1 ')
    .replace(/\.{3,}/g, '…')
    .trim();

  // اعمال نقشه واژگان اعراب‌گذاری شده
  for (const [word, spoken] of Object.entries(PRONUNCIATION_MAP)) {
    out = out.split(word).join(spoken);
  }

  return out;
}
