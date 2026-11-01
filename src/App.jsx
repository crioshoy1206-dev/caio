import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  hasFirebase, login, logout, saveDay, saveSetting, watchDays, watchSetting, runPendingImport, importPayload, watchUser,
} from './store.js'
import {
  addDays, daysBetween, fromKey, mondayOf, monthCells, recurringFor, toKey, toMinutes, WEEKDAYS,
} from './date.js'
import { holidayOn } from './holidays.js'
import DayPanel from './DayPanel.jsx'
import RecurringManager from './RecurringManager.jsx'
import { CategoryManager, CategoryProvider, DEFAULT_CATEGORIES, textOn } from './categories.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import InstallRow from './InstallRow.jsx'
import SearchModal from './Search.jsx'
import { SearchIcon } from './icons.jsx'
import { keyAt, useBlockDrag } from './drag.js'
import { moveSlot, placeEvent, shiftEvent, spanKey, spanRange, timedSlots } from './events.js'
import { deleteAccount } from './account.js'
import { FriendsView, SHARED_COLOR, SharedEventForm, SharedEventModal } from './Social.jsx'
import { ensureProfile, isJoined, myStatus, watchFriends, watchSharedEvents } from './social.js'

export default function App() {
  const [user, setUser] = useState(undefined)
  useEffect(() => watchUser(setUser), [])

  if (user === undefined) return <div className="center muted">불러오는 중…</div>
  if (!user) return <Login />
  return <Shell user={user} />
}

function Login() {
  const [error, setError] = useState('')
  const onLogin = async () => {
    setError('')
    try { await login() } catch (e) { setError(e.message) }
  }
  return (
    <div className="center">
      <div className="login-card">
        <div className="logo"><LogoMark size={88} /></div>
        <h1>CAIO</h1>
        <p className="muted">일정, 할 일, 시간표, 친구와의 약속까지 한곳에서 관리하는 올인원 캘린더</p>
        <button className="google-btn" onClick={onLogin}>
          <GoogleIcon /> Google 계정으로 로그인
        </button>
        {!hasFirebase && (
          <p className="notice">
            Firebase 설정이 아직 없어 <b>체험 모드</b>로 실행됩니다. 데이터는 이 브라우저에만 저장돼요.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {hasFirebase && (
          <p className="consent muted small">
            로그인하면 <a href="/terms">이용약관</a>에 동의하고 <a href="/privacy">개인정보 처리방침</a>을 확인한 것으로 봅니다.
          </p>
        )}
      </div>
      <LegalLinks />
    </div>
  )
}

// 범위 구독 결과를 합칠 때, 그 범위 안에서 사라진 날짜는 지웁니다
function mergeRange(prev, from, to, incoming) {
  const next = {}
  for (const [k, v] of Object.entries(prev)) if (k < from || k > to) next[k] = v
  return { ...next, ...incoming }
}

function Shell({ user }) {
  const today = toKey(new Date())
  const [tab, setTab] = useState('calendar')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [selected, setSelected] = useState(today)
  const [dayOpen, setDayOpen] = useState(null) // 열려 있으면 처음 보여 줄 탭 이름
  const [days, setDays] = useState({})
  const [recurring, setRecurring] = useState([])
  const [showRecurring, setShowRecurring] = useState(false)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [showCategories, setShowCategories] = useState(false)
  const [hiddenCats, setHiddenCats] = useState([])
  const [friendCode, setFriendCode] = useState('')
  const [friends, setFriends] = useState([])
  const [sharedEvents, setSharedEvents] = useState([])
  const [openShared, setOpenShared] = useState(null)
  const [creatingShared, setCreatingShared] = useState(null)
  const [searching, setSearching] = useState(false)

  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor])
  const monthFrom = toKey(cells[0])
  const monthTo = toKey(cells[cells.length - 1])
  const weekTo = addDays(weekStart, 6)

  // 달력에 보이는 달과 시간표에 보이는 주를 각각 구독해서 하나로 합칩니다
  useEffect(
    () => watchDays(user.uid, monthFrom, monthTo, (out) => setDays((p) => mergeRange(p, monthFrom, monthTo, out))),
    [user.uid, monthFrom, monthTo],
  )
  useEffect(
    () => watchDays(user.uid, weekStart, weekTo, (out) => setDays((p) => mergeRange(p, weekStart, weekTo, out))),
    [user.uid, weekStart, weekTo],
  )
  useEffect(() => watchSetting(user.uid, 'recurring', [], setRecurring), [user.uid])
  useEffect(() => {
    ensureProfile(user).then((p) => setFriendCode(p.friendCode)).catch(() => {})
  }, [user])
  useEffect(() => watchFriends(user.uid, setFriends), [user.uid])
  useEffect(() => watchSharedEvents(user.uid, setSharedEvents), [user.uid])
  // 거절한 약속은 캘린더에서 빼고, 초대받은 약속은 점선으로 보여 줍니다
  const visibleShared = sharedEvents.filter((e) => myStatus(e, user.uid) !== 'declined')
  const pendingCount = friends.filter((f) => f.status === 'pending' && f.incoming).length +
    sharedEvents.filter((e) => myStatus(e, user.uid) === 'invited').length
  const openSharedEvent = sharedEvents.find((e) => e.id === openShared)
  useEffect(() => watchSetting(user.uid, 'categories', DEFAULT_CATEGORIES, setCategories), [user.uid])
  useEffect(() => {
    runPendingImport(user.uid).catch((e) => console.error('가져오기 실패', e))
    // 사이트에 올려 둔 내 몫의 가져오기 파일이 있으면 합칩니다 (같은 id는 다시 넣지 않음)
    if (hasFirebase) {
      fetch(`/imports/${user.uid}.json`, { cache: 'no-store' })
        .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
        .then((payload) => payload && importPayload(user.uid, payload))
        .catch((e) => console.error('가져오기 실패', e))
    }
  }, [user.uid])

  const saveError = (e) => alert('저장하지 못했어요: ' + e.message)
  const updateRecurring = (items) => {
    setRecurring(items)
    saveSetting(user.uid, 'recurring', items).catch(saveError)
  }
  const updateCategories = (items) => {
    setCategories(items)
    saveSetting(user.uid, 'categories', items).catch(saveError)
  }
  const categoryCtx = {
    categories,
    setCategories: updateCategories,
    openManager: () => setShowCategories(true),
  }
  const colorOf = (item) =>
    categories.find((c) => c.id === item.categoryId)?.color || item.color || '#6e7781'

  const openDay = (key, initialTab = 'events') => {
    setSelected(key)
    setDayOpen(initialTab)
    const d = fromKey(key)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  const moveDay = (delta) => {
    const key = addDays(selected, delta)
    setSelected(key)
    const d = fromKey(key)
    if (d.getMonth() !== cursor.month || d.getFullYear() !== cursor.year) {
      setCursor({ year: d.getFullYear(), month: d.getMonth() })
    }
  }
  const closeDay = () => setDayOpen(null)
  // 달력에서 블록을 다른 날짜로 끌어 놓았을 때
  const dropBlock = ({ kind, item, key, grab }, target) => {
    const delta = daysBetween(grab || key, target)
    if (!delta) return
    if (kind === 'event') shiftEvent(user.uid, item, key, delta).catch(saveError)
    if (kind === 'slot') moveSlot(user.uid, item, key, addDays(key, delta)).catch(saveError)
  }
  const empty = { events: [], todos: [], timetable: [] }
  const selectedDay = { ...empty, ...days[selected] }
  const updateDay = (next) => {
    setDays((prev) => ({ ...prev, [selected]: next }))
    saveDay(user.uid, selected, next).catch(saveError)
  }

  return (
    <CategoryProvider value={categoryCtx}>
      <div className="app">
        {tab === 'calendar' && (
          <MonthView
            cursor={cursor} setCursor={setCursor} cells={cells} days={days} today={today}
            recurring={recurring} categories={categories} colorOf={colorOf}
            hiddenCats={hiddenCats} setHiddenCats={setHiddenCats}
            onPick={(key) => openDay(key)} onManageCategories={() => setShowCategories(true)}
            shared={visibleShared} uid={user.uid} onDropBlock={dropBlock} onSearch={() => setSearching(true)}
          />
        )}
        {tab === 'week' && (
          <WeekView
            weekStart={weekStart} setWeekStart={setWeekStart} today={today} days={days}
            recurring={recurring} colorOf={colorOf}
            onPick={openDay} onManageRecurring={() => setShowRecurring(true)}
            shared={visibleShared.filter((e) => isJoined(e, user.uid))} onOpenShared={setOpenShared}
          />
        )}
        {tab === 'friends' && (
          <FriendsView user={user} friendCode={friendCode} friends={friends} sharedEvents={sharedEvents}
            today={today} onOpenEvent={setOpenShared} />
        )}
        {tab === 'me' && (
          <ProfileView
            user={user} categories={categories} recurring={recurring}
            onManageCategories={() => setShowCategories(true)}
            onManageRecurring={() => setShowRecurring(true)}
          />
        )}
      </div>

      <nav className="bottom-nav" aria-label="메뉴">
        {[
          ['calendar', <NavIcon key="c" d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />, '캘린더'],
          ['week', <NavIcon key="w" d="M4 4h16v16H4zM4 9h16M9 4v16M14 4v16" />, '시간표'],
          ['friends', <NavIcon key="f" d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2.1.6 3.5 2.3 3.5 5.2" />, '친구'],
          ['me', <NavIcon key="m" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />, '내 정보'],
        ].map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}>
            <span className="nav-icon">
              {icon}
              {id === 'friends' && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {searching && (
          <SearchModal uid={user.uid} shared={visibleShared} today={today}
            onClose={() => setSearching(false)}
            onPick={(key) => { setSearching(false); setTab('calendar'); openDay(key) }} />
        )}
        {dayOpen && (
        <DayPanel
          key={dayOpen}
          dateKey={selected}
          day={selectedDay}
          holiday={holidayOn(selected)}
          recurring={recurringFor(recurring, selected)}
          initialTab={dayOpen}
          onChange={updateDay}
          onManageRecurring={() => setShowRecurring(true)}
          onClose={closeDay}
          onMove={moveDay}
          shared={visibleShared.filter((e) => e.date === selected)}
          uid={user.uid}
          onSaveEvent={(item, from, to) => placeEvent(user.uid, item, selected, from, to).catch(saveError)}
          getRange={(item) => {
            const g = spanKey(item)
            return g ? spanRange(user.uid, selected, g) : Promise.resolve({ start: selected, end: selected })
          }}
          onOpenShared={setOpenShared}
          onCreateShared={() => setCreatingShared(selected)}
        />
      )}
      {creatingShared && (
        <SharedEventForm user={user} dateKey={creatingShared} friends={friends}
          onClose={() => setCreatingShared(null)}
          onCreated={(id) => { setCreatingShared(null); setOpenShared(id) }} />
      )}
      {openSharedEvent && (
        <SharedEventModal key={openSharedEvent.id} user={user} ev={openSharedEvent} friends={friends}
          onClose={() => setOpenShared(null)} />
      )}
      {showRecurring && (
        <RecurringManager items={recurring} onChange={updateRecurring} onClose={() => setShowRecurring(false)} />
      )}
      {showCategories && <CategoryManager onClose={() => setShowCategories(false)} />}
    </CategoryProvider>
  )
}

// 여러 날 이어지는 일정은 한 주 안에서 한 줄의 긴 막대로 그립니다.
const hasSpan = (day, g) => (day?.events || []).some((ev) => spanKey(ev) === g)

// 한 주(7칸)의 이어지는 일정에 줄 번호를 매겨, 칸마다 [막대 | 빈칸] 목록을 돌려줍니다
function weekLanes(keys, days, isVisible) {
  const groups = new Map()
  keys.forEach((k, i) => {
    for (const ev of days[k]?.events || []) {
      const g = spanKey(ev)
      if (!g || !isVisible(ev)) continue
      const cur = groups.get(g)
      if (!cur) groups.set(g, { g, item: ev, start: i, end: i })
      else if (cur.end === i - 1) cur.end = i
    }
  })
  const spans = [...groups.values()]
    .map((x) => ({
      ...x,
      contL: x.start === 0 && hasSpan(days[addDays(keys[0], -1)], x.g),
      contR: x.end === 6 && hasSpan(days[addDays(keys[6], 1)], x.g),
    }))
    .filter((x) => x.end > x.start || x.contL || x.contR)
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const laneEnds = []
  for (const x of spans) {
    let lane = laneEnds.findIndex((end) => end < x.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = x.end
    x.lane = lane
  }
  const perCell = keys.map(() => [])
  for (const x of spans) {
    for (let i = x.start; i <= x.end; i++) perCell[i][x.lane] = i === x.start ? x : 'gap'
  }
  return {
    groups: new Set(spans.map((x) => x.g)),
    slots: perCell.map((list) => Array.from(list, (v) => v || 'gap')),
  }
}

function MonthPicker({ cursor, onPick, onClose }) {
  const [year, setYear] = useState(cursor.year)
  const now = new Date()
  return (
    <>
      <div className="month-picker-backdrop" onClick={onClose} />
      <div className="month-picker" role="dialog" aria-label="달 선택">
        <div className="month-picker-head">
          <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label="이전 해">‹</button>
          <strong>{year}년</strong>
          <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label="다음 해">›</button>
        </div>
        <div className="month-picker-grid">
          {Array.from({ length: 12 }, (_, m) => (
            <button key={m}
              className={[
                year === cursor.year && m === cursor.month && 'on',
                year === now.getFullYear() && m === now.getMonth() && 'now',
              ].filter(Boolean).join(' ')}
              onClick={() => onPick(year, m)}>{m + 1}월</button>
          ))}
        </div>
      </div>
    </>
  )
}

function MonthView({
  cursor, setCursor, cells, days, today, recurring, categories, colorOf,
  hiddenCats, setHiddenCats, onPick, onManageCategories, shared, uid, onDropBlock, onSearch,
}) {
  const { drag, begin, justDragged } = useBlockDrag(onDropBlock)
  const move = (delta) => setCursor(({ year, month }) => {
    const d = new Date(year, month + delta, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const goToday = () => {
    const d = new Date()
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  // 핸드폰: 달력을 옆으로 밀어서 이전/다음 달로
  const swipe = useRef(null)
  const [slide, setSlide] = useState('')
  const onTouchStart = (e) => {
    const t = e.touches[0]
    swipe.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null
  }
  const onTouchEnd = (e) => {
    const s0 = swipe.current
    swipe.current = null
    if (!s0 || drag) return
    const t = e.changedTouches[0]
    const dx = t.clientX - s0.x, dy = t.clientY - s0.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - s0.at > 700) return
    setSlide(dx < 0 ? 'slide-next' : 'slide-prev')
    move(dx < 0 ? 1 : -1)
  }
  const [picking, setPicking] = useState(false)
  // 카테고리 필터: 숨긴 카테고리의 일정은 달력 칸에서 빼고 보여 줍니다
  const isVisible = (item) => !hiddenCats.includes(item.categoryId || 'none')
  const toggleCat = (id) =>
    setHiddenCats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  // 고정 일정은 '캘린더에 표시'를 켠 것만 월간 화면에 나옵니다
  const shownRecurring = recurring.filter((r) => r.showInCalendar)
  let week

  return (
    <>
      <header className="topbar">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="이전 달">‹</button>
          <button className="month-title" onClick={() => setPicking((v) => !v)} aria-label="달 선택">
            <h2>{cursor.year}년 {cursor.month + 1}월</h2><span className="caret">▾</span>
          </button>
          {picking && (
            <MonthPicker cursor={cursor} onClose={() => setPicking(false)}
              onPick={(year, month) => { setCursor({ year, month }); setPicking(false) }} />
          )}
          <button className="icon-btn" onClick={() => move(1)} aria-label="다음 달">›</button>
        </div>
        <div className="row-actions">
          <button className="ghost-btn search-btn" onClick={onSearch} aria-label="검색"><SearchIcon /></button>
          <button className="ghost-btn" onClick={goToday}>오늘</button>
        </div>
      </header>

      <section className="calendar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="weekdays">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</div>
          ))}
        </div>
        <div className={'grid ' + slide} key={cursor.year * 12 + cursor.month}
          onAnimationEnd={() => setSlide('')}>
          {cells.map((d, idx) => {
            const k = toKey(d)
            if (idx % 7 === 0) week = weekLanes(cells.slice(idx, idx + 7).map(toKey), days, isVisible)
            const spanSlots = week.slots[idx % 7]
            const day = days[k]
            const holiday = holidayOn(k)
            const todos = day?.todos || []
            const doneCount = todos.filter((t) => t.done).length
            const skipped = day?.skipRecurring || []
            // 월간 막대: 일정 먼저, 그다음 시간표(표시를 켠 고정 일정 포함)를 시간순으로
            const slots = [
              ...(day?.timetable || []),
              ...recurringFor(shownRecurring, k).filter((r) => !skipped.includes(r.id)),
            ].sort((a, b) => a.start.localeCompare(b.start))
            const together = shared
              .filter((e) => e.date === k)
              .map((e) => ({ id: e.id, title: e.title, shared: true, invited: myStatus(e, uid) === 'invited', start: e.start }))
            const singleEvents = (day?.events || []).filter((ev) => !week.groups.has(spanKey(ev)))
            const bars = [...together, ...singleEvents, ...slots.filter(isVisible)].filter((x) => x.shared || isVisible(x))
            const MAX_BARS = 4
            const shownSpans = spanSlots.slice(0, MAX_BARS)
            const room = MAX_BARS - shownSpans.length
            const hiddenCount = spanSlots.length - shownSpans.length + Math.max(0, bars.length - room)
            const cls = [
              'cell',
              d.getMonth() !== cursor.month && 'other',
              k === today && 'today',
              (d.getDay() === 0 || holiday) && 'sun',
              d.getDay() === 6 && 'sat',
            ].filter(Boolean).join(' ')
            return (
              <button key={k} data-key={k} className={drag?.target === k ? cls + ' drop-target' : cls}
                onClick={() => { if (!justDragged.current) onPick(k) }}>
                <div className="cell-head">
                  <span className="date-num">{d.getDate()}</span>
                  <span className="holiday-label">{holiday ? holiday[0] : '\u00a0'}</span>
                </div>
                <div className="chips">
                  {shownSpans.map((x, lane) => {
                    if (x === 'gap') return <span key={'gap' + lane} className="chip gap" aria-hidden="true">&nbsp;</span>
                    const c = colorOf(x.item)
                    return (
                      <span key={x.g} className={['chip span drag', x.contL && 'cont-l', x.contR && 'cont-r'].filter(Boolean).join(' ')}
                        onPointerDown={(e) => begin(e, { kind: 'event', item: x.item, key: k, title: x.item.title, color: c })}
                        onClick={(e) => {
                          // 옆 칸으로 넘친 막대를 누르면 그 아래 날짜를 엽니다
                          e.stopPropagation()
                          if (!justDragged.current) onPick(keyAt(e.clientX, e.clientY) || k)
                        }}
                        style={{ '--c': c, '--fg': textOn(c), '--n': x.end - x.start + 1, '--l': x.contL ? 1 : 0, '--r': x.contR ? 1 : 0 }}>
                        {x.item.title}
                      </span>
                    )
                  })}
                  {bars.slice(0, room).map((item) => {
                    const c = item.shared ? SHARED_COLOR : colorOf(item)
                    // 끌어 옮길 수 있는 것: 내 일정과 시간표 (친구 약속, 고정 일정은 제외)
                    const kind = item.shared || item.weekdays ? null
                      : singleEvents.includes(item) ? 'event' : 'slot'
                    return (
                      <span key={item.id} className={item.invited ? 'chip invited' : kind ? 'chip drag' : 'chip'} style={{ '--c': c, '--fg': textOn(c) }}
                        onPointerDown={kind ? (e) => begin(e, { kind, item, key: k, title: item.title, color: c }) : undefined}>
                        {item.title}
                      </span>
                    )
                  })}
                  {hiddenCount > 0 && <span className="more">+{hiddenCount}</span>}
                </div>
                {todos.length > 0 && (
                  <div className="meta">
                    <span className={doneCount === todos.length ? 'done' : ''}>✓ {doneCount}/{todos.length}</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, '--c': drag.color, '--fg': textOn(drag.color) }}>
          {drag.title}
        </div>
      )}
    </>
  )
}

const WEEK_ORDER = ['월', '화', '수', '목', '금', '토', '일']

function WeekView({
  weekStart, setWeekStart, today, days, recurring, colorOf, onPick, onManageRecurring, shared, onOpenShared,
}) {
  const keys = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const thisWeek = mondayOf(today) === weekStart
  const s = fromKey(keys[0])
  const e = fromKey(keys[6])
  const range = `${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일`

  const slotsOf = (k) => {
    const skipped = days[k]?.skipRecurring || []
    return [
      ...(days[k]?.timetable || []),
      ...recurringFor(recurring, k).filter((r) => !skipped.includes(r.id)).map((r) => ({ ...r, fixed: true })),
      ...shared.filter((e) => e.date === k && e.start && e.end).map((e) => ({ ...e, title: e.title, shared: true })),
      ...timedSlots(days[k]?.events),
    ]
  }
  const all = keys.flatMap(slotsOf)
  const startHour = Math.min(8, ...all.map((x) => Math.floor(toMinutes(x.start) / 60)))
  const endHour = Math.max(18, ...all.map((x) => Math.ceil(toMinutes(x.end) / 60)))
  const HOUR = 52
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  // 시간을 정한 일정은 아래 시간표에 나오므로 위 '일정' 줄에는 시간 없는 것만
  const untimed = (k) => (days[k]?.events || []).filter((ev) => !ev.startTime)
  const hasEvents = keys.some((k) => untimed(k).length)

  return (
    <>
      <header className="topbar">
        <div className="month-nav">
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="지난주">‹</button>
          <div className="week-title">
            <h2>{thisWeek ? '이번 주 시간표' : '주간 시간표'}</h2>
            <span className="muted small">{range}</span>
          </div>
          <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="다음 주">›</button>
        </div>
        <div className="row-actions">
          {!thisWeek && <button className="ghost-btn" onClick={() => setWeekStart(mondayOf(today))}>이번 주</button>}
          <button className="ghost-btn" onClick={onManageRecurring}>고정 일정</button>
        </div>
      </header>

      <section className="calendar week-page">
        <div className="wk-grid">
          <div className="wk-head">
            <div />
            {keys.map((k, i) => {
              const holiday = holidayOn(k)
              const cls = ['wk-day', k === today && 'today', (i === 6 || holiday) && 'sun', i === 5 && 'sat']
                .filter(Boolean).join(' ')
              return (
                <button key={k} className={cls} onClick={() => onPick(k, 'timetable')}>
                  <span className="wk-dow">{WEEK_ORDER[i]}</span>
                  <span className="wk-date">{fromKey(k).getDate()}</span>
                </button>
              )
            })}
          </div>
          {hasEvents && (
            <div className="wk-allday">
              <div className="wk-label">일정</div>
              {keys.map((k) => (
                <button key={k} className="wk-allday-cell" onClick={() => onPick(k)}>
                  {untimed(k).map((ev) => {
                    const c = colorOf(ev)
                    return <span key={ev.id} className="chip" style={{ '--c': c, '--fg': textOn(c) }}>{ev.title}</span>
                  })}
                </button>
              ))}
            </div>
          )}
          <div className="wk-body" style={{ height: (endHour - startHour) * HOUR }}>
            <div className="week-hours">
              {hours.map((h) => (
                <span key={h} style={{ top: (h - startHour) * HOUR }}>{String(h).padStart(2, '0')}</span>
              ))}
            </div>
            {keys.map((k) => (
              <div key={k} className={k === today ? 'week-col today' : 'week-col'} onClick={() => onPick(k, 'timetable')}>
                {hours.map((h) => <div key={h} className="week-line" style={{ top: (h - startHour) * HOUR }} />)}
                {slotsOf(k).map((x) => {
                  const c = x.shared ? SHARED_COLOR : colorOf(x)
                  return (
                    <div key={x.id} className="wk-block"
                      onClick={x.shared ? (e) => { e.stopPropagation(); onOpenShared(x.id) }
                        : x.fromEvent ? (e) => { e.stopPropagation(); onPick(k) } : undefined}
                      style={{
                        '--c': c, '--fg': textOn(c),
                        top: ((toMinutes(x.start) - startHour * 60) / 60) * HOUR,
                        height: Math.max(((toMinutes(x.end) - toMinutes(x.start)) / 60) * HOUR - 2, 18),
                      }}>
                      <strong>{x.title}</strong>
                      <span>{x.start}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        {all.length === 0 && (
          <p className="empty">
            이번 주 시간표가 비어 있어요. 날짜를 눌러 시간표를 넣거나, 고정 일정에 학교 시간표를 등록해 보세요.
          </p>
        )}
      </section>
    </>
  )
}

function ProfileView({ user, categories, recurring, onManageCategories, onManageRecurring }) {
  return (
    <div className="profile">
      <section className="profile-card">
        {user.photoURL
          ? <img src={user.photoURL} alt="" className="avatar big" referrerPolicy="no-referrer" />
          : <span className="avatar placeholder big">{(user.displayName || '?')[0]}</span>}
        <div>
          <h2>{user.displayName}</h2>
          {user.email && <p className="muted">{user.email}</p>}
          {user.demo && <span className="badge">체험 모드 · 이 브라우저에만 저장돼요</span>}
        </div>
      </section>

      <section className="settings">
        <div className="setting-row">
          <div>
            <strong>화면 테마</strong>
            <p className="muted small">시스템 설정, 라이트, 다크 중에 골라요.</p>
          </div>
          <ThemeToggle />
        </div>
        <button className="setting-row link" onClick={onManageCategories}>
          <div>
            <strong>카테고리</strong>
            <p className="muted small">{categories.map((c) => c.name).join(', ') || '없음'}</p>
          </div>
          <span className="chev">›</span>
        </button>
        <button className="setting-row link" onClick={onManageRecurring}>
          <div>
            <strong>고정 일정</strong>
            <p className="muted small">
              {recurring.length}개 · 캘린더에 표시 {recurring.filter((r) => r.showInCalendar).length}개
            </p>
          </div>
          <span className="chev">›</span>
        </button>
        <InstallRow />
        {!user.demo && <ImportRow uid={user.uid} />}
      </section>

      <button className="logout-btn" onClick={logout}>로그아웃</button>
      {!user.demo && <DeleteAccount user={user} />}

      <footer className="app-footer">
        <div className="brand"><LogoMark size={28} /><strong>CAIO</strong></div>
        <LegalLinks />
        <p className="muted small">문의: <a href="mailto:hunny.mustard.c@gmail.com">hunny.mustard.c@gmail.com</a></p>
      </footer>
    </div>
  )
}

// 계정 삭제: 확인 문구를 입력해야 실행됩니다
function DeleteAccount({ user }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const onDelete = async () => {
    setBusy(true)
    setStatus('삭제하는 중…')
    try {
      await deleteAccount(user)
    } catch (e) {
      setStatus('삭제하지 못했어요: ' + (e.code === 'auth/popup-closed-by-user' ? '본인 확인 창이 닫혔어요. 다시 시도해 주세요.' : e.message))
      setBusy(false)
    }
  }
  if (!open) {
    return <button className="delete-account-btn" onClick={() => setOpen(true)}>계정 삭제</button>
  }
  return (
    <section className="delete-account" aria-labelledby="del-title">
      <h3 id="del-title">계정을 삭제할까요?</h3>
      <p className="small">
        내 일정, 할 일, 시간표, 카테고리, 고정 일정, 프로필, 친구 목록, 내가 만든 함께하는 일정과 그 채팅이 모두 지워지고 되돌릴 수 없어요.
        다른 사람이 만든 일정에서는 빠지고, 거기에 남긴 내 채팅은 지워져요.
      </p>
      <label className="small" htmlFor="del-confirm">확인을 위해 <b>삭제</b>라고 입력하세요.</label>
      <input id="del-confirm" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} autoComplete="off" />
      <div className="row-actions">
        <button className="ghost-btn" onClick={() => { setOpen(false); setText(''); setStatus('') }} disabled={busy}>취소</button>
        <button className="danger-btn" onClick={onDelete} disabled={busy || text.trim() !== '삭제'}>영구 삭제</button>
      </div>
      {status && <p className="small" role="status">{status}</p>}
    </section>
  )
}

// 다른 캘린더에서 옮긴 일정 파일(.json)을 골라 한 번에 넣습니다
function ImportRow({ uid }) {
  const [status, setStatus] = useState('')
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus('가져오는 중…')
    try {
      const count = await importPayload(uid, JSON.parse(await file.text()))
      setStatus(`일정 ${count}개를 가져왔어요`)
    } catch (err) {
      setStatus('가져오지 못했어요: ' + err.message)
    }
  }
  return (
    <label className="setting-row link">
      <div>
        <strong>일정 가져오기</strong>
        <p className="muted small">{status || '옮길 일정 파일(.json)을 골라 주세요.'}</p>
      </div>
      <span className="chev">›</span>
      <input type="file" accept=".json,application/json" hidden onChange={onFile} />
    </label>
  )
}

export function LogoMark({ size = 64 }) {
  // CAIO 로고: 플립 달력 카드 위의 흰색 C (public/icon.svg와 같은 모양)
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="140 160 744 744" aria-hidden="true">
      <defs>
        <linearGradient id={id + 't'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8B95FF" /><stop offset="0.55" stopColor="#4E8BFF" /><stop offset="1" stopColor="#3480FF" />
        </linearGradient>
        <linearGradient id={id + 'b'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4A9BFF" /><stop offset="1" stopColor="#2F7BFF" />
        </linearGradient>
        <clipPath id={id + 'c'}><rect x="152" y="232" width="720" height="660" rx="150" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect x="152" y="232" width="720" height="330" fill={`url(#${id}t)`} />
        <rect x="152" y="562" width="720" height="330" fill={`url(#${id}b)`} />
        <rect x="152" y="559" width="720" height="5" fill="#2A63E0" opacity="0.35" />
      </g>
      <rect x="352" y="172" width="60" height="120" rx="30" fill="#fff" stroke="#6F8CFF" strokeWidth="12" />
      <rect x="612" y="172" width="60" height="120" rx="30" fill="#fff" stroke="#6F8CFF" strokeWidth="12" />
      <path d="M615.1 434.2 A172 172 0 1 0 615.1 689.8" fill="none" stroke="#fff" strokeWidth="92" strokeLinecap="round" />
      <circle cx="660" cy="562" r="44" fill="#fff" />
    </svg>
  )
}

function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="약관 및 정책">
      <a href="/privacy" className="privacy-link">개인정보 처리방침</a>
      <span aria-hidden="true">·</span>
      <a href="/terms">이용약관</a>
    </nav>
  )
}

function NavIcon({ d }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  )
}
