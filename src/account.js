// 계정 삭제: 내 데이터를 Firestore에서 지운 뒤 로그인 계정(Firebase Auth)까지 지웁니다.
import { GoogleAuthProvider, deleteUser, reauthenticateWithPopup } from 'firebase/auth'
import {
  collection, deleteDoc, doc, getDocs, query, updateDoc, where,
} from 'firebase/firestore'
import { auth, db } from './store.js'

async function deleteAll(snap) {
  for (const d of snap.docs) await deleteDoc(d.ref)
}

export async function deleteAccount(user) {
  const uid = user.uid
  const current = auth.currentUser
  // 오래전에 로그인했다면 Google 계정으로 한 번 더 확인합니다 (데이터를 지우기 전에)
  const signedInAt = Number(current?.metadata?.lastLoginAt || 0)
  if (Date.now() - signedInAt > 4 * 60 * 1000) {
    await reauthenticateWithPopup(current, new GoogleAuthProvider())
  }

  // 함께하는 일정: 내가 만든 건 채팅까지 삭제, 초대받은 건 내 채팅을 지우고 참여자에서 빠집니다
  const shared = await getDocs(query(collection(db, 'sharedEvents'), where('memberIds', 'array-contains', uid)))
  for (const ev of shared.docs) {
    const messages = collection(db, 'sharedEvents', ev.id, 'messages')
    if (ev.data().ownerId === uid) {
      await deleteAll(await getDocs(messages))
      await deleteDoc(ev.ref)
    } else {
      await deleteAll(await getDocs(query(messages, where('uid', '==', uid))))
      await updateDoc(ev.ref, {
        [`members.${uid}`]: { name: '탈퇴한 사용자', photoURL: null, status: 'declined' },
      })
    }
  }

  // 친구 관계, 공개 프로필, 내 일정과 설정
  await deleteAll(await getDocs(query(collection(db, 'friendships'), where('memberIds', 'array-contains', uid))))
  await deleteDoc(doc(db, 'profiles', uid))
  await deleteAll(await getDocs(collection(db, 'users', uid, 'days')))
  await deleteAll(await getDocs(collection(db, 'users', uid, 'settings')))

  try { localStorage.clear() } catch { /* 저장 불가 환경 */ }
  await deleteUser(current)
}
