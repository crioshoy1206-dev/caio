import { useEffect, useRef, useState } from 'react'
import {
  createSharedEvent, deleteSharedEvent, inviteMore, isJoined, myStatus, removeFriend, requestFriend,
  respondFriend, respondInvite, sendMessage, updateSharedEvent, watchMessages,
} from './social.js'
import { formatLong, toMinutes } from './date.js'
import TimeSelect from './TimeSelect.jsx'

export const SHARED_COLOR = '#e93d82'

const STATUS_LABEL = { owner: '만든 사람', accepted: '참여', invited: '응답 대기', declined: '불참' }

function Avatar({ name, photoURL, size = 32 }) {
  return photoURL
    ? <img src={photoURL} alt="" className="avatar" style={{ width: size, height: size }} referrerPolicy="no-referrer" />
    : <span className="avatar placeholder" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || '?')[0]}</span>
}

const mapUrl = (place) => `https://map.naver.com/p/search/${encodeURIComponent(place)}`
const timeText = (ev) => (ev.start ? `${ev.start}${ev.end ? `–${ev.end}` : ''}` : '시간 미정')

// ───────── 친구 탭 ─────────
export function FriendsView({ user, friendCode, friends, sharedEvents, today, onOpenEvent }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState(null)

  const incoming = friends.filter((f) => f.status === 'pending' && f.incoming)
  const outgoing = friends.filter((f) => f.status === 'pending' && !f.incoming)
  const accepted = friends.filter((f) => f.status === 'accepted')
  const invites = sharedEvents.filter((e) => myStatus(e, user.uid) === 'invited')
  const upcoming = sharedEvents
    .filter((e) => isJoined(e, user.uid) && e.date >= today)
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))

  const add = async (e) => {
    e.preventDefault()
    setError(''); setNotice(''); setBusy(true)
    try {
      await requestFriend(user, code)
      setNotice('친구 요청을 보냈어요. 상대가 수락하면 친구 목록에 나타나요.')
      setCode('')
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(friendCode); setNotice('친구 코드를 복사했어요.') } catch { setNotice('코드를 길게 눌러 복사해 주세요.') }
  }
  const remove = (id) => {
    if (confirmId !== id) return setConfirmId(id)
    setConfirmId(null)
    removeFriend(id)
  }

  return (
    <div className="friends">
      <header className="topbar"><h2 className="page-title">친구</h2></header>

      <section className="card my-code">
        <div>
          <span className="muted small">내 친구 코드</span>
          <strong className="code">{friendCode || '······'}</strong>
          <p className="muted small">친구에게 이 코드를 알려 주면 나를 추가할 수 있어요.</p>
        </div>
        <button className="ghost-btn" onClick={copy}>복사</button>
      </section>

      <form className="card form inline" onSubmit={add}>
        <input id="friend-code" placeholder="친구 코드 6자리" value={code} maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
        <button className="primary-btn" disabled={busy}>친구 추가</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}

      {(invites.length > 0 || incoming.length > 0) && (
        <section className="card">
          <h3 className="section-title">받은 요청 <span className="count">{invites.length + incoming.length}</span></h3>
          <ul className="list">
            {invites.map((ev) => (
              <li key={ev.id} className="invite-row">
                <button className="invite-main" onClick={() => onOpenEvent(ev.id)}>
                  <span className="pill" style={{ '--c': SHARED_COLOR }}>약속 초대</span>
                  <strong>{ev.title}</strong>
                  <span className="muted small">
                    {ev.members[ev.ownerId]?.name} · {formatLong(ev.date)} {timeText(ev)}{ev.place && ` · ${ev.place}`}
                  </span>
                </button>
                <div className="row-actions">
                  <button className="ghost-btn" onClick={() => respondInvite(ev.id, user.uid, 'declined')}>거절</button>
                  <button className="primary-btn" onClick={() => respondInvite(ev.id, user.uid, 'accepted')}>참여</button>
                </div>
              </li>
            ))}
            {incoming.map((f) => (
              <li key={f.id} className="invite-row">
                <div className="invite-main">
                  <span className="pill">친구 요청</span>
                  <span className="friend-name"><Avatar {...f} size={26} />{f.name}</span>
                </div>
                <div className="row-actions">
                  <button className="ghost-btn" onClick={() => respondFriend(f.id, false)}>거절</button>
                  <button className="primary-btn" onClick={() => respondFriend(f.id, true)}>수락</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="section-title">다가오는 약속</h3>
        {upcoming.length === 0 && <p className="empty">아직 약속이 없어요. 캘린더에서 날짜를 눌러 "친구와 약속 만들기"를 해 보세요.</p>}
        <ul className="list">
          {upcoming.map((ev) => (
            <li key={ev.id}>
              <button className="shared-row" onClick={() => onOpenEvent(ev.id)} style={{ '--c': SHARED_COLOR }}>
                <div>
                  <strong>{ev.title}</strong>
                  <span className="muted small">{formatLong(ev.date)} {timeText(ev)}{ev.place && ` · ${ev.place}`}</span>
                </div>
                <span className="faces">
                  {Object.entries(ev.members).filter(([, m]) => ['owner', 'accepted'].includes(m.status)).slice(0, 4)
                    .map(([uid, m]) => <Avatar key={uid} {...m} size={24} />)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">친구 {accepted.length}명</h3>
        {accepted.length === 0 && <p className="empty">친구 코드로 친구를 추가해 보세요.</p>}
        <ul className="list">
          {accepted.map((f) => (
            <li key={f.id} className="friend-row">
              <span className="friend-name"><Avatar {...f} size={32} />{f.name}</span>
              {confirmId === f.id
                ? <button className="danger-btn" onClick={() => remove(f.id)}>친구 삭제</button>
                : <button className="del" aria-label="친구 삭제" onClick={() => remove(f.id)}>×</button>}
            </li>
          ))}
          {outgoing.map((f) => (
            <li key={f.id} className="friend-row pending">
              <span className="friend-name"><Avatar {...f} size={32} />{f.name}</span>
              <span className="muted small">수락 기다리는 중</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function FriendPicker({ friends, value, onChange, exclude = [] }) {
  const list = friends.filter((f) => f.status === 'accepted' && !exclude.includes(f.uid))
  if (list.length === 0) return <p className="muted small">초대할 수 있는 친구가 없어요. 친구 탭에서 먼저 친구를 추가해 주세요.</p>
  const toggle = (uid) => onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid])
  return (
    <div className="friend-picker">
      {list.map((f) => (
        <button type="button" key={f.uid} className={value.includes(f.uid) ? 'friend-chip on' : 'friend-chip'}
          aria-pressed={value.includes(f.uid)} onClick={() => toggle(f.uid)}>
          <Avatar {...f} size={22} />{f.name}
        </button>
      ))}
    </div>
  )
}

// ───────── 약속 만들기 ─────────
export function SharedEventForm({ user, dateKey, friends, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', date: dateKey, start: '18:00', end: '20:00', place: '', memo: '' })
  const [invitees, setInvitees] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError('약속 이름을 입력하세요.')
    if (toMinutes(form.end) <= toMinutes(form.start)) return setError('끝나는 시간이 시작 시간보다 늦어야 해요.')
    if (invitees.length === 0) return setError('초대할 친구를 한 명 이상 골라 주세요.')
    setBusy(true)
    try {
      const picked = friends.filter((f) => invitees.includes(f.uid))
      const id = await createSharedEvent(user, { ...form, title: form.title.trim(), place: form.place.trim(), memo: form.memo.trim() }, picked)
      onCreated(id)
    } catch (err) { setError('만들지 못했어요: ' + err.message); setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>친구와 약속 만들기</h3>
            <p className="muted small">초대한 친구가 수락하면 함께 시간, 장소를 보고 채팅할 수 있어요.</p>
          </div>
          <button className="del big" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <form className="form" onSubmit={submit}>
          <input id="shared-title" placeholder="약속 이름 (예: 민지 생일 저녁)" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input id="shared-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="row">
            <TimeSelect label="시작" value={form.start} onChange={(start) => setForm({ ...form, start })} />
            <span className="muted">~</span>
            <TimeSelect label="끝" value={form.end} onChange={(end) => setForm({ ...form, end })} />
          </div>
          <input id="shared-place" placeholder="장소 (예: 홍대입구역 9번 출구)" value={form.place}
            onChange={(e) => setForm({ ...form, place: e.target.value })} />
          <textarea id="shared-memo" rows={2} placeholder="메모 (선택)" value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          <span className="muted small">초대할 친구</span>
          <FriendPicker friends={friends} value={invitees} onChange={setInvitees} />
          {error && <p className="error">{error}</p>}
          <div className="row-actions end">
            <button className="primary-btn" disabled={busy}>초대 보내기</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ───────── 약속 상세 + 채팅 ─────────
export function SharedEventModal({ user, ev, friends, onClose }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ev)
  const [inviting, setInviting] = useState(false)
  const [more, setMore] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const status = myStatus(ev, user.uid)
  const joined = isJoined(ev, user.uid)
  const isOwner = ev.ownerId === user.uid

  useEffect(() => { if (!editing) setDraft(ev) }, [ev, editing])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    if (!draft.title.trim()) return setError('약속 이름을 입력하세요.')
    if (toMinutes(draft.end) <= toMinutes(draft.start)) return setError('끝나는 시간이 시작 시간보다 늦어야 해요.')
    setError('')
    const changes = ['title', 'date', 'start', 'end', 'place', 'memo'].filter((k) => draft[k] !== ev[k])
    await updateSharedEvent(ev.id, {
      title: draft.title.trim(), date: draft.date, start: draft.start, end: draft.end,
      place: (draft.place || '').trim(), memo: (draft.memo || '').trim(),
    })
    // 바뀐 내용을 채팅방에 알려서 모두가 알 수 있게
    if (changes.length) {
      const names = { title: '이름', date: '날짜', start: '시간', end: '시간', place: '장소', memo: '메모' }
      const what = [...new Set(changes.map((k) => names[k]))].join(', ')
      await sendMessage({ ...ev, members: {} }, user, `${what}을(를) 바꿨어요: ${formatLong(draft.date)} ${draft.start}–${draft.end}${draft.place ? ` · ${draft.place}` : ''}`)
    }
    setEditing(false)
  }
  const invite = async () => {
    const picked = friends.filter((f) => more.includes(f.uid))
    if (picked.length) await inviteMore(ev, picked)
    setMore([]); setInviting(false)
  }
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    await deleteSharedEvent(ev.id)
    onClose()
  }

  const members = Object.entries(ev.members)
    .sort(([, a], [, b]) => ['owner', 'accepted', 'invited', 'declined'].indexOf(a.status) - ['owner', 'accepted', 'invited', 'declined'].indexOf(b.status))

  return (
    <div className="modal-backdrop day-backdrop" onClick={onClose}>
      <div className="modal day-modal shared-modal" role="dialog" aria-label={ev.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="modal-head">
          <div className="shared-head" style={{ '--c': SHARED_COLOR }}>
            <span className="pill">함께하는 약속</span>
            <h3>{ev.title}</h3>
          </div>
          <button className="del big" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {status === 'invited' && (
          <div className="invite-banner">
            <span><b>{ev.members[ev.ownerId]?.name}</b>님이 초대했어요. 참여할까요?</span>
            <div className="row-actions">
              <button className="ghost-btn" onClick={() => respondInvite(ev.id, user.uid, 'declined')}>거절</button>
              <button className="primary-btn" onClick={() => respondInvite(ev.id, user.uid, 'accepted')}>참여하기</button>
            </div>
          </div>
        )}
        {status === 'declined' && (
          <div className="invite-banner muted-banner">
            <span>불참으로 답했어요.</span>
            <button className="ghost-btn" onClick={() => respondInvite(ev.id, user.uid, 'accepted')}>다시 참여하기</button>
          </div>
        )}

        {!editing ? (
          <dl className="shared-info">
            <dt>날짜</dt><dd>{formatLong(ev.date)}</dd>
            <dt>시간</dt><dd>{timeText(ev)}</dd>
            <dt>장소</dt>
            <dd>
              {ev.place
                ? <>{ev.place} <a className="link-btn" href={mapUrl(ev.place)} target="_blank" rel="noreferrer">지도 보기</a></>
                : <span className="muted">아직 안 정했어요</span>}
            </dd>
            {ev.memo && (<><dt>메모</dt><dd className="pre">{ev.memo}</dd></>)}
          </dl>
        ) : (
          <div className="form">
            <input id="edit-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <input id="edit-date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <div className="row">
              <TimeSelect label="시작" value={draft.start} onChange={(start) => setDraft({ ...draft, start })} />
              <span className="muted">~</span>
              <TimeSelect label="끝" value={draft.end} onChange={(end) => setDraft({ ...draft, end })} />
            </div>
            <input id="edit-place" placeholder="장소" value={draft.place || ''} onChange={(e) => setDraft({ ...draft, place: e.target.value })} />
            <textarea id="edit-memo" rows={2} placeholder="메모" value={draft.memo || ''} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
            {error && <p className="error">{error}</p>}
            <div className="row-actions end">
              <button className="ghost-btn" onClick={() => setEditing(false)}>취소</button>
              <button className="primary-btn" onClick={save}>저장하고 알리기</button>
            </div>
          </div>
        )}
        {joined && !editing && (
          <div className="row-actions shared-actions">
            <button className="ghost-btn" onClick={() => setEditing(true)}>시간·장소 바꾸기</button>
            {isOwner && <button className="ghost-btn" onClick={() => setInviting(!inviting)}>친구 더 초대</button>}
            {!isOwner && <button className="ghost-btn" onClick={() => respondInvite(ev.id, user.uid, 'declined')}>나가기</button>}
            {isOwner && (
              <button className={confirmDelete ? 'danger-btn' : 'ghost-btn'} onClick={remove}>
                {confirmDelete ? '정말 약속 삭제' : '삭제'}
              </button>
            )}
          </div>
        )}
        {inviting && (
          <div className="form">
            <FriendPicker friends={friends} value={more} onChange={setMore} exclude={ev.memberIds} />
            <div className="row-actions end"><button className="primary-btn" onClick={invite}>초대 보내기</button></div>
          </div>
        )}

        <h4 className="section-title">참여자</h4>
        <ul className="members">
          {members.map(([uid, m]) => (
            <li key={uid} className={`member ${m.status}`}>
              <Avatar {...m} size={28} />
              <span>{m.name}{uid === user.uid && ' (나)'}</span>
              <span className="status">{STATUS_LABEL[m.status]}</span>
            </li>
          ))}
        </ul>

        <h4 className="section-title">채팅</h4>
        {joined
          ? <Chat ev={ev} user={user} />
          : <p className="muted small">참여하면 채팅방을 볼 수 있어요.</p>}
      </div>
    </div>
  )
}

function Chat({ ev, user }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const listRef = useRef(null)
  useEffect(() => watchMessages(ev.id, setMessages), [ev.id])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async (e) => {
    e.preventDefault()
    const t = text
    setText('')
    await sendMessage(ev, user, t)
  }
  const time = (ms) => {
    const d = new Date(ms)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="empty">첫 메시지를 보내 보세요.</p>}
        {messages.map((m) => {
          const mine = m.uid === user.uid
          return (
            <div key={m.id} className={mine ? 'msg mine' : 'msg'}>
              {!mine && <span className="msg-name">{m.name}</span>}
              <div className="msg-line">
                <p className="bubble">{m.text}</p>
                <span className="msg-time">{time(m.createdAt)}</span>
              </div>
            </div>
          )
        })}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input id="chat-text" placeholder="메시지 보내기" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary-btn" disabled={!text.trim()}>보내기</button>
      </form>
    </div>
  )
}
