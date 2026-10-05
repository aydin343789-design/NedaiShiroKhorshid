import womanImg from '../assets/voice-woman.webp';
import manImg from '../assets/voice-man.webp';
import childImg from '../assets/voice-child.webp';
import narratorImg from '../assets/voice-narrator.jpg';

export interface CharacterItem {
  id: 'female' | 'male' | 'child' | 'narrator';
  name: string;
  role: string;
  avatar: string;
  description: string;
}

export interface ToneItem {
  id: 'cheerful' | 'intimate' | 'sad' | 'formal' | 'professional' | 'epic';
  name: string;
  iconName: string;
  description: string;
}

export const CHARACTERS: CharacterItem[] = [
  {
    id: 'female',
    name: 'سارا',
    role: 'بانو (زنانه)',
    avatar: womanImg,
    description: 'صدای شفاف، لطیف و رسا',
  },
  {
    id: 'male',
    name: 'امیر',
    role: 'آقا (مردانه)',
    avatar: manImg,
    description: 'صدای گرم، باوقار و پرطنین',
  },
  {
    id: 'child',
    name: 'کیان',
    role: 'کودکانه',
    avatar: childImg,
    description: 'صدای شیرین، شاد و پرانرژی',
  },
  {
    id: 'narrator',
    name: 'راوی',
    role: 'حکیم (کهن)',
    avatar: narratorImg,
    description: 'صدای عمیق، داستانی و متین',
  },
];

export const TONES: ToneItem[] = [
  { id: 'cheerful', name: 'شاد', iconName: 'smile', description: 'روشن، پرانرژی و لبخنددار' },
  { id: 'intimate', name: 'صمیمی', iconName: 'heart', description: 'نرم، نزدیک و دوستانه' },
  { id: 'sad', name: 'غمگین', iconName: 'cloud-rain', description: 'آرام، سنگین و احساسی' },
  { id: 'formal', name: 'رسمی', iconName: 'newspaper', description: 'منظم، شمرده و اداری' },
  { id: 'professional', name: 'حرفه‌ای', iconName: 'briefcase', description: 'شفاف، مطمئن و ارائه‌ای' },
  { id: 'epic', name: 'حماسی', iconName: 'sparkles', description: 'باشکوه، عمیق و قدرتمند' },
];

// Single sample text as requested
export const DEFAULT_SAMPLE_TEXT =
  'ای ایران ای مرز پرگهر، ای خاکت سرچشمه هنر، دور از تو اندیشه بدان، پاینده مانی و جاودان.';
