export const pad = (n) => String(n).padStart(2, '0')
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 일요일부터 시작하는 6주(42칸) 달력 칸
export function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

export const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function formatLong(k) {
  const d = fromKey(k)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
}

// 그 날짜에 해당하는 고정 일정 (요일과 적용 기간으로 판단)
export function recurringFor(items, key) {
  const weekday = fromKey(key).getDay()
  return items.filter((r) =>
    r.weekdays.includes(weekday) && (!r.from || key >= r.from) && (!r.until || key <= r.until))
}

export const addDays = (key, n) => {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

// 그 날짜가 속한 주의 월요일
export function mondayOf(key) {
  const dow = fromKey(key).getDay()
  return addDays(key, dow === 0 ? -6 : 1 - dow)
}

// 두 날짜 키 사이의 일 수 (b - a)
export const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000)
