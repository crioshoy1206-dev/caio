// 한국 공휴일 계산 (관공서의 공휴일에 관한 규정 기준)
// 음력 명절은 계산 대신 연도별 날짜표를 씁니다. 표에 없는 해는 양력 공휴일만 표시돼요.
import { fromKey, pad } from './date.js'

// [설날, 추석, 부처님오신날] (양력)
const LUNAR = {
  2025: ['01-29', '10-06', '05-05'],
  2026: ['02-17', '09-25', '05-24'],
  2027: ['02-07', '09-15', '05-13'],
  2028: ['01-27', '10-03', '05-02'],
  2029: ['02-13', '09-22', '05-20'],
  2030: ['02-03', '09-12', '05-09'],
}

// 선거일, 임시공휴일
const EXTRA = {
  '2025-01-27': '임시공휴일',
  '2025-06-03': '대통령선거',
  '2026-06-03': '지방선거',
  '2028-04-12': '국회의원선거',
}

const shift = (key, days) => {
  const d = fromKey(key)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const cache = {}

// { 'YYYY-MM-DD': ['이름', ...] }
export function holidaysOf(year) {
  if (cache[year]) return cache[year]
  const map = {}
  const add = (key, name) => { (map[key] ||= []).push(name) }
  // [날짜, 이름, 대체공휴일 규칙] 규칙: 'weekend' = 토·일·겹침, 'sunday' = 일·겹침(설날·추석), null = 없음
  const base = [
    ['01-01', '신정', null],
    ['03-01', '삼일절', 'weekend'],
    ['05-05', '어린이날', 'weekend'],
    ['06-06', '현충일', null],
    ['08-15', '광복절', 'weekend'],
    ['10-03', '개천절', 'weekend'],
    ['10-09', '한글날', 'weekend'],
    ['12-25', '성탄절', 'weekend'],
  ]
  if (year >= 2026) {
    base.push(['05-01', '노동절', 'weekend'])
    base.push(['07-17', '제헌절', 'weekend'])
  }
  const entries = base.map(([md, name, rule]) => [`${year}-${md}`, name, rule])

  const lunar = LUNAR[year]
  if (lunar) {
    const [seol, chuseok, buddha] = lunar.map((md) => `${year}-${md}`)
    entries.push([shift(seol, -1), '설날 연휴', 'sunday'], [seol, '설날', 'sunday'], [shift(seol, 1), '설날 연휴', 'sunday'])
    entries.push([shift(chuseok, -1), '추석 연휴', 'sunday'], [chuseok, '추석', 'sunday'], [shift(chuseok, 1), '추석 연휴', 'sunday'])
    entries.push([buddha, '부처님오신날', 'weekend'])
  }
  for (const [key, name] of entries) add(key, name)
  for (const [key, name] of Object.entries(EXTRA)) if (key.startsWith(`${year}-`)) add(key, name)

  // 대체공휴일: 규칙에 걸린 날짜마다 하나씩, 그 뒤 첫 번째 평일(공휴일 아닌 날)
  // (같은 날 두 공휴일이 겹쳐도 대체공휴일은 하루)
  const needs = new Map()
  for (const [key, name, rule] of entries) {
    if (!rule || needs.has(key)) continue
    const dow = fromKey(key).getDay()
    const overlap = map[key].length > 1
    if (overlap || dow === 0 || (rule === 'weekend' && dow === 6)) needs.set(key, name.replace(' 연휴', ''))
  }
  for (const [key, name] of [...needs].sort()) {
    let d = shift(key, 1)
    while (map[d] || [0, 6].includes(fromKey(d).getDay())) d = shift(d, 1)
    add(d, `대체공휴일(${name})`)
  }
  cache[year] = map
  return map
}

export const holidayOn = (key) => holidaysOf(Number(key.slice(0, 4)))[key] || null
