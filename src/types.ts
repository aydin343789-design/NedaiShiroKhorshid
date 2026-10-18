export type CharacterId = 'male' | 'female' | 'child' | 'narrator';
export type ToneId = 'cheerful' | 'intimate' | 'sad' | 'formal' | 'professional' | 'newscast' | 'epic';

export interface SavedAudioClip {
  id: string;
  text: string;
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
