// 저장소: Firebase 설정이 있으면 구글 로그인 + Firestore, 없으면 브라우저에만 저장하는 체험 모드.
import { initializeApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
} from 'firebase/auth'
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, where, documentId,
  getDoc, getDocs, writeBatch,
} from 'firebase/firestore'
import { addDays } from './date.js'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const hasFirebase = Boolean(config.apiKey && config.projectId)

export let auth, db
if (hasFirebase) {
  const app = initializeApp(config)
  auth = getAuth(app)
  db = getFirestore(app)
}

const DEMO_USER = { uid: 'demo', displayName: '체험 사용자', photoURL: null, demo: true }
const DEMO_KEY = 'my-calendar-demo-days'
export const demoListeners = new Set()

// localStorage를 못 쓰는 환경을 위해 메모리 사본도 함께 둡니다
const demoMemory = {}
export function demoGet(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    if (v !== null) return JSON.parse(v)
  } catch { /* 저장 불가 환경 */ }
  return demoMemory[key] ?? fallback
}
export function demoSet(key, value) {
  demoMemory[key] = value
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 저장 불가 환경 */ }
  demoListeners.forEach((fn) => fn())
}
const readDemo = () => demoGet(DEMO_KEY, {})
const writeDemo = (days) => demoSet(DEMO_KEY, days)

// 체험 모드 로그인 상태 (탭을 닫으면 로그아웃)
let demoLoggedIn = false
function demoSession(value) {
  if (value !== undefined) {
    demoLoggedIn = value
    try {
      if (value) sessionStorage.setItem('demo-login', '1')
      else sessionStorage.removeItem('demo-login')
    } catch { /* 저장 불가 환경에서는 메모리에만 기억 */ }
  }
  try { return demoLoggedIn || Boolean(sessionStorage.getItem('demo-login')) } catch { return demoLoggedIn }
}

export function watchUser(callback) {
  if (!hasFirebase) {
    callback(demoSession() ? DEMO_USER : null)
    const fn = () => callback(demoSession() ? DEMO_USER : null)
    window.addEventListener('demo-auth', fn)
    return () => window.removeEventListener('demo-auth', fn)
  }
  return onAuthStateChanged(auth, callback)
}

export async function login() {
  if (!hasFirebase) {
    demoSession(true)
    window.dispatchEvent(new Event('demo-auth'))
    return
  }
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function logout() {
  if (!hasFirebase) {
    demoSession(false)
    window.dispatchEvent(new Event('demo-auth'))
    return
  }
  await signOut(auth)
}

// 날짜 키(YYYY-MM-DD) 범위의 데이터를 실시간으로 받아 { [dateKey]: day } 로 넘깁니다.
export function watchDays(uid, fromKey, toKey, callback) {
  if (!hasFirebase) {
    const emit = () => {
      const all = readDemo()
      const out = {}
      for (const k of Object.keys(all)) if (k >= fromKey && k <= toKey) out[k] = all[k]
      callback(out)
    }
    emit()
    demoListeners.add(emit)
    return () => demoListeners.delete(emit)
  }
  const q = query(
    collection(db, 'users', uid, 'days'),
    where(documentId(), '>=', fromKey),
    where(documentId(), '<=', toKey),
  )
  return onSnapshot(q, (snap) => {
    const out = {}
    snap.forEach((d) => { out[d.id] = d.data() })
    callback(out)
  })
}

const isEmpty = (day) =>
  !day.events?.length && !day.todos?.length && !day.timetable?.length && !day.skipRecurring?.length

export async function saveDay(uid, dateKey, day) {
  if (!hasFirebase) {
    const all = readDemo()
    if (isEmpty(day)) delete all[dateKey]
    else all[dateKey] = day
    writeDemo(all)
    return
  }
  const ref = doc(db, 'users', uid, 'days', dateKey)
  if (isEmpty(day)) await deleteDoc(ref)
  else await setDoc(ref, day)
}

// 설정 목록(고정 일정, 카테고리): users/{uid}/settings/{name} 문서 하나에 { items } 로 저장합니다.
export function watchSetting(uid, name, fallback, callback) {
  if (!hasFirebase) {
    const emit = () => callback(demoGet(`my-calendar-demo-${name}`, fallback))
    emit()
    demoListeners.add(emit)
    return () => demoListeners.delete(emit)
  }
  return onSnapshot(doc(db, 'users', uid, 'settings', name), (snap) => {
    callback(snap.exists() ? snap.data().items || [] : fallback)
  })
}

export async function saveSetting(uid, name, items) {
  if (!hasFirebase) {
    demoSet(`my-calendar-demo-${name}`, items)
    return
  }
  await setDoc(doc(db, 'users', uid, 'settings', name), { items })
}

// 다른 앱에서 옮겨온 일정: users/{uid}/settings/import 에 { payload } 로 넣어 두면
// 로그인할 때 날짜별 문서에 합쳐 넣고 지웁니다. 같은 id는 다시 넣지 않습니다.
export async function runPendingImport(uid) {
  if (!hasFirebase) return 0
  const importRef = doc(db, 'users', uid, 'settings', 'import')
  const snap = await getDoc(importRef)
  if (!snap.exists()) return 0
  const count = await importPayload(uid, JSON.parse(snap.data().payload || '{}'))
  await deleteDoc(importRef)
  return count
}

// 가져오기 파일 형식: { cats: [카테고리 id], add: [새 카테고리], rows: [...] }
export async function importPayload(uid, { version, cats = [], add: addCategories = [], rows = [], recurring = [], recurringUpdate = [], removeItems = [], skipRecurring = [] }) {
  // version이 있는 파일은 한 번만 적용합니다 (나중에 직접 고친 내용을 되돌리지 않도록)
  const logRef = version && doc(db, 'users', uid, 'settings', 'importLog')
  if (logRef && ((await getDoc(logRef)).data()?.done || []).includes(version)) return 0
  // rows: [시작일, 마지막 날(여러 날이면), 제목, 시작, 끝, 카테고리 번호, 메모]
  const days = {}
  const dayOf = (k) => (days[k] ||= { events: [], timetable: [] })
  rows.forEach(([date, endDate, title, start, end, cat, memo], i) => {
    const categoryId = cats[cat]
    if (start) {
      dayOf(date).timetable.push({ id: `tb${i}`, title, start, end, categoryId })
      return
    }
    let k = date
    for (let j = 0; k <= (endDate || date); j++, k = addDays(k, 1)) {
      dayOf(k).events.push({ id: `tb${i}-${j}`, title, memo, categoryId })
    }
  })
  const count = rows.length
  const keys = Object.keys(days).sort()
  const existing = {}
  if (keys.length) {
    const q = query(
      collection(db, 'users', uid, 'days'),
      where(documentId(), '>=', keys[0]),
      where(documentId(), '<=', keys[keys.length - 1]),
    )
    ;(await getDocs(q)).forEach((d) => { existing[d.id] = d.data() })
  }
  const merge = (list = [], extra = []) => {
    const ids = new Set(list.map((x) => x.id))
    return [...list, ...extra.filter((x) => !ids.has(x.id))]
  }
  const ops = keys.map((k) => {
    const cur = existing[k] || {}
    return [k, {
      events: merge(cur.events, days[k].events),
      todos: cur.todos || [],
      timetable: merge(cur.timetable, days[k].timetable),
      ...(cur.skipRecurring ? { skipRecurring: cur.skipRecurring } : {}),
    }]
  })
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const [k, day] of ops.slice(i, i + 400)) batch.set(doc(db, 'users', uid, 'days', k), day)
    await batch.commit()
  }
  if (addCategories.length) {
    const catRef = doc(db, 'users', uid, 'settings', 'categories')
    const current = (await getDoc(catRef)).data()?.items || []
    await setDoc(catRef, { items: merge(current, addCategories) })
  }
  // 고정 일정(요일마다 반복): 같은 id는 다시 넣지 않습니다
  if (recurring.length) {
    const recRef = doc(db, 'users', uid, 'settings', 'recurring')
    const current = (await getDoc(recRef)).data()?.items || []
    await setDoc(recRef, { items: merge(current, recurring) })
  }
  // 이미 있는 고정 일정을 같은 id로 고쳐 씁니다 (없으면 새로 넣음)
  if (recurringUpdate.length) {
    const recRef = doc(db, 'users', uid, 'settings', 'recurring')
    const current = (await getDoc(recRef)).data()?.items || []
    const byId = new Map(recurringUpdate.map((x) => [x.id, x]))
    const next = current.map((x) => (byId.has(x.id) ? { ...x, ...byId.get(x.id) } : x))
    const have = new Set(current.map((x) => x.id))
    await setDoc(recRef, { items: [...next, ...recurringUpdate.filter((x) => !have.has(x.id))] })
  }
  // 날짜별로 지울 항목 [날짜, id] 와 그날만 뺄 고정 일정 [날짜, 고정 일정 id]
  const touched = [...new Set([...removeItems, ...skipRecurring].map(([k]) => k))]
  for (const k of touched) {
    const ref = doc(db, 'users', uid, 'days', k)
    const cur = (await getDoc(ref)).data()
    if (!cur) continue
    const drop = new Set(removeItems.filter(([d]) => d === k).map(([, id]) => id))
    const skip = skipRecurring.filter(([d]) => d === k).map(([, id]) => id)
    await setDoc(ref, {
      ...cur,
      events: (cur.events || []).filter((x) => !drop.has(x.id)),
      timetable: (cur.timetable || []).filter((x) => !drop.has(x.id)),
      ...(skip.length ? { skipRecurring: [...new Set([...(cur.skipRecurring || []), ...skip])] } : {}),
    })
  }
  if (logRef) {
    const done = (await getDoc(logRef)).data()?.done || []
    await setDoc(logRef, { done: [...done, version] })
  }
  return count + recurring.length + recurringUpdate.length + removeItems.length
}

const emptyDay = () => ({ events: [], todos: [], timetable: [] })

// 여러 날짜 문서를 읽어서 fn(날짜, 그날 데이터)으로 고친 뒤 저장합니다 (화면에 안 보이는 날짜도 포함)
export async function mutateDays(uid, keys, fn) {
  const unique = [...new Set(keys)]
  if (!hasFirebase) {
    const all = readDemo()
    for (const k of unique) {
      const next = fn(k, { ...emptyDay(), ...all[k] })
      if (isEmpty(next)) delete all[k]
      else all[k] = next
    }
    writeDemo(all)
    return
  }
  await Promise.all(unique.map(async (k) => {
    const ref = doc(db, 'users', uid, 'days', k)
    const snap = await getDoc(ref)
    const next = fn(k, { ...emptyDay(), ...(snap.exists() ? snap.data() : {}) })
    if (isEmpty(next)) await deleteDoc(ref)
    else await setDoc(ref, next)
  }))
}

// 날짜 하나를 읽어 옵니다
export async function readDay(uid, key) {
  if (!hasFirebase) return { ...emptyDay(), ...readDemo()[key] }
  const snap = await getDoc(doc(db, 'users', uid, 'days', key))
  return { ...emptyDay(), ...(snap.exists() ? snap.data() : {}) }
}

// 검색용: 내 모든 날짜 데이터를 한 번 읽어 옵니다
export async function readAllDays(uid) {
  if (!hasFirebase) return readDemo()
  const out = {}
  ;(await getDocs(collection(db, 'users', uid, 'days'))).forEach((d) => { out[d.id] = d.data() })
  return out
}
