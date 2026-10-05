/**
 * Intelligent Persian Phonetic and Vocalization Engine
 * Developed for "Nedaye Shirokhorshid" Offline TTS Studio
 * 
 * Provides rule-based and dictionary-based vocalization, diacritics insertion (Harakat),
 * Ezafe detection, number-to-words expansion, and punctuation pacing for crystal-clear Persian speech.
 */

// Comprehensive Persian pronunciation dictionary for common words that need short vowels to sound natural
const PRONUNCIATION_DICTIONARY: Record<string, string> = {
  // Brand & App terms
  'شیروخورشید': 'شیر و خُرشید',
  'شیر و خورشید': 'شیر و خُرشید',
  'ندای شیروخورشید': 'نِدایِ شیر و خُرشید',
  'ندای': 'نِدایِ',
  'آوااستودیو': 'آوا استودیو',

  // National & Cultural
  'ایران': 'ایران',
  'ایرانی': 'ایرانی',
  'ایرانیان': 'ایرانیان',
  'تهران': 'تِهران',
  'آذربایجان': 'آذَربایجان',
  'اصفهان': 'اِصفهان',
  'شیراز': 'شیراز',
  'مشهد': 'مَشهد',
  'تبریز': 'تَبریز',
  'کرمانشاه': 'کِرمانشاه',
  'کردستان': 'کُردستان',
  'خوزستان': 'خوزِستان',
  'گیلان': 'گیلان',
  'مازندران': 'مازَندَران',
  'خراسان': 'خُراسان',
  'فارس': 'فارس',
  'پارس': 'پارس',
  'پارسی': 'پارسی',
  'فارسی': 'فارسی',

  // Common vocabulary with crucial vowels
  'سرزمین': 'سَرزَمینِ',
  'مرز': 'مَرزِ',
  'پرگهر': 'پُرگوهَر',
  'خاکت': 'خاکَت',
  'سرچشمه': 'سَرچِشمِه‌یِ',
  'هنر': 'هُنَر',
  'فرهنگ': 'فَرهَنگ',
  'تمدن': 'تَمَدُّن',
  'تاریخ': 'تاریخِ',
  'کشور': 'کِشوَر',
  'کشورمان': 'کِشوَرِمان',
  'مردم': 'مَردُم',
  'مردمان': 'مَردُمان',
  'فناوری': 'فَناوَری',
  'هوش مصنوعی': 'هوشِ مَصنوعی',
  'صوت': 'صُوت',
  'صدا': 'صِدا',
  'گفتار': 'گُفتار',
  'متن': 'مَتن',
  'گوینده': 'گویَندِه',
  'داستان': 'داستان',
  'پیام': 'پَیام',
  'کتاب': 'کِتاب',
  'آموزش': 'آموزِش',
  'دانش': 'دانِش',
  'پژوهش': 'پَژوهِش',

  // Poetic & Literary
  'درود': 'دُرود',
  'سلام': 'سَلام',
  'سپاس': 'سِپاس',
  'امروز': 'اِمروز',
  'فردا': 'فَردا',
  'دیروز': 'دیروز',
  'روزگار': 'روزِگار',
  'زندگی': 'زِندِگی',
  'امید': 'اُمید',
  'آزادی': 'آزادی',
  'عدالت': 'عِدالَت',
  'مهربانی': 'مِهرَبانی',
  'محبت': 'مَحَبَّت',
  'عشق': 'عِشق',
  'دوستی': 'دوستی',
  'همدلی': 'هَمدِلی',
  'زیبا': 'زیبا',
  'زیبایی': 'زیبایی',
  'پیروزی': 'پیروزی',
  'موفقیت': 'مُوَفَّقیَّت',
  'آینده': 'آیَندِه',
  'جهان': 'جَهان',
  'گیتی': 'گیتی',
  'خورشید': 'خُرشید',
  'ستاره': 'سِتارِه',
  'آسمان': 'آسِمان',
  'زمین': 'زَمین',
  'درخت': 'دِرَخت',
  'گلستان': 'گُلِستان',
  'بوستان': 'بوستان',
  'شاهنامه': 'شاهنامِه',
  'فردوسی': 'فِردُوسی',
  'حافظ': 'حافِظ',
  'سعدی': 'سَعدی',
  'مولانا': 'مُولانا',
  'خیام': 'خَیّام',

  // Grammatical markers & prepositions
  'برای': 'بَرایِ',
  'برای شما': 'بَرایِ شُما',
  'برای من': 'بَرایِ مَن',
  'شما': 'شُما',
  'من': 'مَن',
  'آن‌ها': 'آن‌ها',
  'این‌ها': 'این‌ها',
  'است': 'اَست',
  'هست': 'هَست',
  'نیست': 'نیست',
  'هستند': 'هَستَند',
  'نیستند': 'نیستَند',
  'بود': 'بود',
  'شد': 'شُد',
  'می‌شود': 'می‌شَوَد',
  'می‌کند': 'می‌کُنَد',
  'می‌گوید': 'می‌گویَد',
  'دارد': 'دارَد',
  'ندارد': 'نَدارَد',
  'باید': 'بایَد',
  'نباید': 'نَبایَد',
  'شاید': 'شایَد',
  'اگر': 'اَگَر',
  'مگر': 'مَگَر',
  'چون': 'چون',
  'بلکه': 'بَلکِه',
  'همچنین': 'هَمچِنین',
  'همچون': 'هَمچون',
  'مانند': 'مانَندِ',
  'بین': 'بِینِ',
  'میان': 'میانِ',
  'روی': 'رویِ',
  'زیر': 'زیرِ',
  'پشت': 'پُشتِ',
  'پیش': 'پیشِ',
  'سوی': 'سویِ',
  'بدون': 'بِدونِ',
  'همراه': 'هَمراهِ',
  'درباره': 'دَرباره‌یِ',
  'بهترین': 'بِهتَرین',
  'بزرگ‌ترین': 'بُزُرگ‌ترین',
  'نخستین': 'نُخُستین',
  'دومین': 'دُوُّمین',
  'سومین': 'سِوُّمین',
  'چهارمین': 'چَهارُمین',
  'پنجمین': 'پَنجُمین',
};

// Persian Number words (0-20, tens, hundreds, thousands)
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
  '30': 'سی',
  '40': 'چِهِل',
  '50': 'پَنجاه',
  '60': 'شَصت',
  '70': 'هَفتاد',
  '80': 'هَشتاد',
  '90': 'نَوَد',
  '100': 'صَد',
  '200': 'دویست',
  '300': 'سیصَد',
  '400': 'چَهارصَد',
  '500': 'پانصَد',
  '1000': 'هِزار',
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Replaces digits with spoken Persian words where simple, or standard digits
 */
function expandNumbers(text: string): string {
  // Convert Persian/Arabic digits to Latin first
  let out = text
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));

  // Replace isolated numbers 0-20 with words for natural spoken sound
  out = out.replace(/\b(\d{1,2})\b/g, (match) => {
    if (NUMBER_WORDS[match]) {
      return NUMBER_WORDS[match];
    }
    return match;
  });

  return out;
}

/**
 * Main vocalization & normalizer function
 */
export function vocalizePersianText(input: string): string {
  if (!input) return '';

  let text = input
    // Normalize Arabic/Persian letter variants
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه‌یِ')
    .replace(/\u200c+/g, '\u200c') // Zero-width non-joiner (نیم‌فاصله)
    .replace(/[ـ]+/g, '')          // Tatweel / Kashida
    .replace(/[ \t]+/g, ' ')       // Extra spaces
    .trim();

  // Expand numbers to Persian words
  text = expandNumbers(text);

  // Apply pronunciation dictionary
  for (const [word, spoken] of Object.entries(PRONUNCIATION_DICTIONARY)) {
    // Exact word boundary or space boundary replacement
    const pattern = new RegExp(`(?<=^|\\s|[،؛.!?])${word}(?=$|\\s|[،؛.!?])`, 'g');
    text = text.replace(pattern, spoken);
  }

  // Optimize punctuation spacing for human speech pacing
  text = text
    .replace(/([،؛])/g, '$1 ')
    .replace(/([.!?…])/g, '$1  ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}
