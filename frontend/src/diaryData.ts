import type { ApiEntry, EntryRequest } from './api';
import { decryptJSON, encryptJSON, type EncryptedPayload } from './crypto';

export type Mood = '开心' | '平静' | '疲惫' | '焦虑' | '难过' | '愤怒' | '思考' | '愉快' | '感恩';

export type DiaryPayload = {
  mood: Mood;
  favorite: boolean;
  text: string;
  images: string[];
  savedAt?: string;
};

export type Entry = {
  id: string;
  apiId?: number;
  version?: number;
  date: string;
  weekday: string;
  mood: Mood;
  favorite: boolean;
  text: string;
  images: string[];
  savedAt: string;
};

export type DraftEntry = Omit<Entry, 'mood'> & { mood?: Mood };

export const moods: Mood[] = ['开心', '平静', '疲惫', '焦虑', '难过', '愤怒', '思考', '愉快', '感恩'];

export async function apiEntryToEntry(key: CryptoKey | unknown, apiEntry: ApiEntry): Promise<Entry> {
  const payload = await decryptJSON<DiaryPayload>(key as CryptoKey, {
    encryptedPayload: apiEntry.encryptedPayload,
    nonce: apiEntry.nonce
  });
  return {
    id: String(apiEntry.id),
    apiId: apiEntry.id,
    version: apiEntry.version,
    date: apiEntry.entryDate,
    weekday: formatWeekday(apiEntry.entryDate),
    mood: payload.mood,
    favorite: payload.favorite,
    text: payload.text,
    images: payload.images,
    savedAt: payload.savedAt ?? '已保存'
  };
}

export async function entryToApiRequest(key: CryptoKey | unknown, entry: DraftEntry, text: string): Promise<EntryRequest> {
  if (!entry.mood) throw new Error('missing_mood');
  const encrypted: EncryptedPayload = await encryptJSON(key as CryptoKey, {
    mood: entry.mood,
    favorite: entry.favorite,
    text,
    images: entry.images,
    savedAt: '已保存'
  } satisfies DiaryPayload);
  return {
    entryDate: entry.date,
    encryptedPayload: encrypted.encryptedPayload,
    nonce: encrypted.nonce,
    ...(entry.version ? { version: entry.version } : {})
  };
}

export function formatWeekday(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${date}T00:00:00`));
}
