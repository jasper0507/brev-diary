import { formatWeekday } from './diaryData';

export function todayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayWeekday(dateString = todayDateString()) {
  return formatWeekday(dateString);
}
