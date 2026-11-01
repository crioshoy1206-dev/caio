// 일정 옮기기, 늘리기, 지우기: 여러 날에 걸친 일정은 날마다 사본을 두고 같은 span 값으로 묶습니다.
import { addDays, daysBetween } from './date.js'
import { mutateDays, readDay } from './store.js'
import { newId } from './categories.jsx'

// 묶음 이름: 새로 만든 일정은 span 필드, 타임블록에서 가져온 일정은 id가 tb숫자-순번
export const spanKey = (ev) => ev.span || ev.id?.match(/^(tb\d+)-\d+$/)?.[1] || null

const daysIn = (from, to) => Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i))

// 묶인 일정이 실제로 걸쳐 있는 첫날과 마지막 날을 찾습니다 (최대 앞뒤 60일)
export async function spanRange(uid, key, g) {
  const has = (day) => day.events.some((ev) => spanKey(ev) === g)
  let start = key
  let end = key
  for (let i = 0; i < 60; i++) {
    const prev = addDays(start, -1)
    if (!has(await readDay(uid, prev))) break
    start = prev
  }
  for (let i = 0; i < 60; i++) {
    const next = addDays(end, 1)
    if (!has(await readDay(uid, next))) break
    end = next
  }
  return { start, end }
}

// item(그 날짜 key에 있던 일정)을 from~to 기간으로 다시 놓습니다. from이 없으면 지웁니다.
export async function placeEvent(uid, item, key, from, to) {
  const g = spanKey(item)
  const old = g ? await spanRange(uid, key, g) : { start: key, end: key }
  const isOld = (ev) => (g ? spanKey(ev) === g : ev.id === item.id)
  const { id: _id, span: _span, ...base } = item
  let copies = {}
  if (from) {
    const keys = daysIn(from, to < from ? from : to)
    if (keys.length === 1) {
      copies[keys[0]] = { ...base, id: g ? newId() : item.id }
    } else {
      const g2 = g || 'sp' + newId()
      keys.forEach((k, j) => { copies[k] = { ...base, id: `${g2}-${j}`, span: g2 } })
    }
  }
  const touched = [...daysIn(old.start, old.end), ...Object.keys(copies)]
  await mutateDays(uid, touched, (k, day) => {
    const at = day.events.findIndex(isOld)
    const events = day.events.filter((ev) => !isOld(ev))
    if (copies[k]) events.splice(at >= 0 ? at : events.length, 0, copies[k])
    return { ...day, events }
  })
}

// 달력에서 끌어 옮기기: 기간 길이는 그대로 두고 delta일만큼 밉니다
export async function shiftEvent(uid, item, key, delta) {
  const g = spanKey(item)
  const { start, end } = g ? await spanRange(uid, key, g) : { start: key, end: key }
  await placeEvent(uid, item, key, addDays(start, delta), addDays(end, delta))
}

export async function moveSlot(uid, item, fromKey, toKey) {
  await mutateDays(uid, [fromKey, toKey], (k, day) => {
    let timetable = day.timetable.filter((x) => x.id !== item.id)
    if (k === toKey) timetable = [...timetable, item]
    return { ...day, timetable }
  })
}

// 시간을 정한 일정은 시간표에도 블록으로 보여 줍니다 (끝 시간이 없거나 앞서면 1시간짜리로)
export function timedSlots(events = []) {
  return events.filter((ev) => ev.startTime).map((ev) => {
    const [h, m] = ev.startTime.split(':').map(Number)
    const fallback = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const end = ev.endTime && ev.endTime > ev.startTime ? ev.endTime : fallback
    return { id: `ev-${ev.id}`, title: ev.title, categoryId: ev.categoryId, color: ev.color, start: ev.startTime, end, fromEvent: true }
  })
}
