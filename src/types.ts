export type CharacterId = 'male' | 'female' | 'child' | 'narrator';
export type ToneId = 'cheerful' | 'intimate' | 'sad' | 'formal' | 'professional' | 'newscast' | 'epic';
export type LanguageId = 'fa' | 'en';

export interface SavedAudioClip {
  id: string;
  text: string;
  language?: LanguageId;
  character: CharacterId;
  characterName: string;
  tone: ToneId;
  toneName: string;
  audioUrl: string;
  createdAt: string;
  duration: number;
  speed: number;
  pitch: number;
}
