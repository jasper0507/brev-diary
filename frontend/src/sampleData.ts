import type { Entry } from './diaryData';

export const initialEntries: Entry[] = [
  {
    id: '2026-05-20',
    date: '2026-05-20',
    weekday: '周二',
    mood: '平静',
    favorite: true,
    text: '整理房间的一天。翻到很多以前的笔记和信件，有些回忆突然很清晰。',
    images: ['misty-mountains', 'window-light'],
    savedAt: '已保存'
  },
  {
    id: '2026-05-19',
    date: '2026-05-19',
    weekday: '周一',
    mood: '思考',
    favorite: false,
    text: '窗外一直在下雨，点了热拿铁，想清楚了几件拖了很久的事。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-18',
    date: '2026-05-18',
    weekday: '周日',
    mood: '愉快',
    favorite: false,
    text: '很久没有和老朋友见面了，聊了很多过去的事。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-17',
    date: '2026-05-17',
    weekday: '周六',
    mood: '平静',
    favorite: false,
    text: '傍晚散步回来，身体很累，但心里慢慢安静下来。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-16',
    date: '2026-05-16',
    weekday: '周五',
    mood: '感恩',
    favorite: true,
    text: '有人很认真地听我说完整段话。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-15',
    date: '2026-05-15',
    weekday: '周四',
    mood: '思考',
    favorite: false,
    text: '今天想先把事情写下来，再决定它们应该放在哪里。',
    images: [],
    savedAt: '已保存'
  }
];
