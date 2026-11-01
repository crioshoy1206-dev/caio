// 친구, 함께하는 일정, 일정 채팅
// Firestore 구조
//   profiles/{uid}                 { name, photoURL, friendCode }            로그인한 사람은 누구나 읽기 (친구 코드 검색용)
//   friendships/{a_b}              { memberIds: [a, b], profiles, requestedBy, status: 'pending' | 'accepted' }
//   sharedEvents/{id}              { title, date, start, end, place, memo, ownerId, memberIds, members: { uid: { name, photoURL, status } } }
//   sharedEvents/{id}/messages/{id} { uid, name, text, createdAt }
// 체험 모드에서는 같은 동작을 브라우저 저장소와 가상 친구로 흉내 냅니다.
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { db, demoGet, demoListeners, demoSet, hasFirebase } from './store.js'
import { addDays, toKey } from './date.js'

const randomCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
const newId = () => Math.random().toString(36).slice(2, 10)
const brief = (u) => ({ name: u.displayName || u.name || '이름 없음', photoURL: u.photoURL || null })

// ───────── 체험 모드 저장소 ─────────
const SOCIAL_KEY = 'my-calendar-demo-social'
const DEMO_FRIENDS = {
  minji: { name: '민지', photoURL: null },
  seojun: { name: '서준', photoURL: null },
  haeun: { name: '하은', photoURL: null },
}
const REPLIES = ['좋아! 👍', '나 그때 괜찮아', '장소 거기 좋다', '혹시 30분만 늦춰도 돼?', '오케이~ 그때 봐', 'ㅋㅋㅋ 완전 좋아']

function demoState() {
  let st = demoGet(SOCIAL_KEY, null)
  if (!st) {
    // 처음 열면 예시 친구와 초대를 하나 넣어 둡니다
    const today = toKey(new Date())
    const me = { uid: 'demo', ...brief({ displayName: '체험 사용자' }) }
    st = {
      profile: { friendCode: 'DEMO42' },
      friendships: [
        { id: 'f1', other: 'minji', status: 'accepted', incoming: false },
        { id: 'f2', other: 'seojun', status: 'accepted', incoming: false },
        { id: 'f3', other: 'haeun', status: 'pending', incoming: true },
      ],
      events: [{
        id: 'e1', title: '민지 생일 저녁', date: addDays(today, 3), start: '18:30', end: '21:00',
        place: '홍대입구역 9번 출구', memo: '케이크는 내가 준비할게!', ownerId: 'minji',
        memberIds: ['minji', 'demo', 'seojun'],
        members: {
          minji: { ...DEMO_FRIENDS.minji, status: 'owner' },
          demo: { name: me.name, photoURL: null, status: 'invited' },
          seojun: { ...DEMO_FRIENDS.seojun, status: 'accepted' },
        },
      }],
      messages: {
        e1: [
          { id: 'm1', uid: 'minji', name: '민지', text: '이번 주 토요일 저녁 어때? 장소는 홍대 쪽으로 생각 중!', createdAt: Date.now() - 3600e3 },
          { id: 'm2', uid: 'seojun', name: '서준', text: '난 좋아 ㅎㅎ', createdAt: Date.now() - 3000e3 },
        ],
      },
    }
    demoSet(SOCIAL_KEY, st)
  }
  return st
}
const saveDemo = (st) => demoSet(SOCIAL_KEY, st)
const demoWatch = (emit) => {
  emit()
  demoListeners.add(emit)
  return () => demoListeners.delete(emit)
}
const later = (fn, ms = 1500) => setTimeout(fn, ms)

// ───────── 프로필과 친구 코드 ─────────
export async function ensureProfile(user) {
  if (!hasFirebase) return demoState().profile
  const ref = doc(db, 'profiles', user.uid)
  const snap = await getDoc(ref)
  const friendCode = snap.exists() ? snap.data().friendCode : randomCode()
  await setDoc(ref, { ...brief(user), friendCode }, { merge: true })
  return { friendCode }
}

// ───────── 친구 ─────────
// 콜백에 [{ id, uid, name, photoURL, status, incoming }] 를 넘깁니다
export function watchFriends(uid, callback) {
  if (!hasFirebase) {
    return demoWatch(() => {
      callback(demoState().friendships.map((f) => ({
        id: f.id, uid: f.other, ...(DEMO_FRIENDS[f.other] || { name: f.name }), status: f.status, incoming: f.incoming,
      })))
    })
  }
  const q = query(collection(db, 'friendships'), where('memberIds', 'array-contains', uid))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => {
      const f = d.data()
      const other = f.memberIds.find((x) => x !== uid)
      return { id: d.id, uid: other, ...f.profiles[other], status: f.status, incoming: f.requestedBy !== uid }
    }))
  })
}

export async function requestFriend(user, code) {
  code = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('친구 코드는 6자리 영문·숫자예요.')
  if (!hasFirebase) {
    const st = demoState()
    if (code === st.profile.friendCode) throw new Error('내 친구 코드예요.')
    // 체험 모드: 아무 코드나 가상 친구가 되고, 잠시 뒤 상대가 수락합니다
    const key = `demo-${code}`
    if (st.friendships.some((f) => f.other === key)) throw new Error('이미 추가한 친구예요.')
    DEMO_FRIENDS[key] = { name: `친구 ${code}`, photoURL: null }
    st.friendships.push({ id: newId(), other: key, name: `친구 ${code}`, status: 'pending', incoming: false })
    saveDemo(st)
    later(() => {
      const s2 = demoState()
      const f = s2.friendships.find((x) => x.other === key)
      if (f) { f.status = 'accepted'; saveDemo(s2) }
    }, 2000)
    return
  }
  const found = await getDocs(query(collection(db, 'profiles'), where('friendCode', '==', code), limit(1)))
  if (found.empty) throw new Error('그 코드를 쓰는 사람을 찾지 못했어요. 코드를 다시 확인해 주세요.')
  const other = found.docs[0]
  if (other.id === user.uid) throw new Error('내 친구 코드예요.')
  const id = [user.uid, other.id].sort().join('_')
  const existing = await getDoc(doc(db, 'friendships', id))
  if (existing.exists()) throw new Error('이미 친구이거나 요청을 보낸 사람이에요.')
  await setDoc(doc(db, 'friendships', id), {
    memberIds: [user.uid, other.id],
    profiles: { [user.uid]: brief(user), [other.id]: brief(other.data()) },
    requestedBy: user.uid,
    status: 'pending',
  })
}

export async function respondFriend(id, accept) {
  if (!hasFirebase) {
    const st = demoState()
    if (accept) st.friendships.find((f) => f.id === id).status = 'accepted'
    else st.friendships = st.friendships.filter((f) => f.id !== id)
    saveDemo(st)
    return
  }
  if (accept) await updateDoc(doc(db, 'friendships', id), { status: 'accepted' })
  else await deleteDoc(doc(db, 'friendships', id))
}

export const removeFriend = (id) => respondFriend(id, false)

// ───────── 함께하는 일정 ─────────
export function watchSharedEvents(uid, callback) {
  if (!hasFirebase) return demoWatch(() => callback(demoState().events))
  const q = query(collection(db, 'sharedEvents'), where('memberIds', 'array-contains', uid))
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
}

// data: { title, date, start, end, place, memo }, friends: [{ uid, name, photoURL }]
export async function createSharedEvent(user, data, friends) {
  const members = { [user.uid]: { ...brief(user), status: 'owner' } }
  for (const f of friends) members[f.uid] = { name: f.name, photoURL: f.photoURL || null, status: 'invited' }
  const ev = { ...data, ownerId: user.uid, memberIds: Object.keys(members), members }
  if (!hasFirebase) {
    const st = demoState()
    const id = newId()
    st.events.push({ ...ev, id })
    st.messages[id] = []
    saveDemo(st)
    // 체험 모드: 초대받은 가상 친구들이 잠시 뒤 수락하고 인사합니다
    later(() => {
      const s2 = demoState()
      const e = s2.events.find((x) => x.id === id)
      if (!e) return
      for (const f of friends) {
        if (e.members[f.uid]) e.members[f.uid].status = 'accepted'
        ;(s2.messages[id] ||= []).push({ id: newId(), uid: f.uid, name: f.name, text: '초대 고마워! 갈게 🙌', createdAt: Date.now() })
      }
      saveDemo(s2)
    }, 2500)
    return id
  }
  const ref = await addDoc(collection(db, 'sharedEvents'), { ...ev, createdAt: serverTimestamp() })
  return ref.id
}

// 시간, 장소, 메모 등 내용 수정 (참여자 누구나)
export async function updateSharedEvent(id, patch) {
  if (!hasFirebase) {
    const st = demoState()
    Object.assign(st.events.find((e) => e.id === id), patch)
    saveDemo(st)
    return
  }
  await updateDoc(doc(db, 'sharedEvents', id), patch)
}

// 초대에 답하기: 'accepted' | 'declined'
export async function respondInvite(id, uid, status) {
  if (!hasFirebase) {
    const st = demoState()
    st.events.find((e) => e.id === id).members[uid].status = status
    saveDemo(st)
    return
  }
  await updateDoc(doc(db, 'sharedEvents', id), { [`members.${uid}.status`]: status })
}

// 이미 만든 일정에 친구 더 초대하기 (만든 사람만)
export async function inviteMore(ev, friends) {
  const members = { ...ev.members }
  for (const f of friends) members[f.uid] = { name: f.name, photoURL: f.photoURL || null, status: 'invited' }
  const patch = { members, memberIds: Object.keys(members) }
  if (!hasFirebase) {
    await updateSharedEvent(ev.id, patch)
    later(() => {
      const s2 = demoState()
      const e = s2.events.find((x) => x.id === ev.id)
      if (!e) return
      for (const f of friends) if (e.members[f.uid]) e.members[f.uid].status = 'accepted'
      saveDemo(s2)
    }, 2500)
    return
  }
  await updateDoc(doc(db, 'sharedEvents', ev.id), patch)
}

export async function deleteSharedEvent(id) {
  if (!hasFirebase) {
    const st = demoState()
    st.events = st.events.filter((e) => e.id !== id)
    delete st.messages[id]
    saveDemo(st)
    return
  }
  await deleteDoc(doc(db, 'sharedEvents', id))
}

// ───────── 채팅 ─────────
export function watchMessages(eventId, callback) {
  if (!hasFirebase) return demoWatch(() => callback(demoState().messages[eventId] || []))
  const q = query(collection(db, 'sharedEvents', eventId, 'messages'), orderBy('createdAt'), limit(300))
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => {
    const m = d.data()
    return { id: d.id, ...m, createdAt: m.createdAt?.toMillis?.() ?? Date.now() }
  })))
}

export async function sendMessage(ev, user, text) {
  text = text.trim()
  if (!text) return
  if (!hasFirebase) {
    const st = demoState()
    ;(st.messages[ev.id] ||= []).push({ id: newId(), uid: user.uid, name: brief(user).name, text, createdAt: Date.now() })
    saveDemo(st)
    // 체험 모드: 참여 중인 가상 친구 한 명이 답장합니다
    const others = Object.entries(ev.members).filter(([uid, m]) => uid !== user.uid && ['owner', 'accepted'].includes(m.status))
    if (others.length) {
      const [uid, m] = others[Math.floor(Math.random() * others.length)]
      later(() => {
        const s2 = demoState()
        ;(s2.messages[ev.id] ||= []).push({
          id: newId(), uid, name: m.name, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], createdAt: Date.now(),
        })
        saveDemo(s2)
      }, 1800)
    }
    return
  }
  await addDoc(collection(db, 'sharedEvents', ev.id, 'messages'), {
    uid: user.uid, name: brief(user).name, text, createdAt: serverTimestamp(),
  })
}

// 내 참여 상태
export const myStatus = (ev, uid) => ev.members?.[uid]?.status
export const isJoined = (ev, uid) => ['owner', 'accepted'].includes(myStatus(ev, uid))
