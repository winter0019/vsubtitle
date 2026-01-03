
export interface ProcessingStatus {
  step: 'idle' | 'loading' | 'translating' | 'merging' | 'completed' | 'error';
  progress: number;
  message: string;
}

export interface SubtitleEntry {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

export enum TranslationModel {
  GEMINI_FLASH = 'gemini-3-flash-preview',
  GEMINI_PRO = 'gemini-3-pro-preview'
}
