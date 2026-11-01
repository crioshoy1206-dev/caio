import { useEffect, useRef, useState } from 'react'
import { formatLong, toMinutes } from './date.js'
import { CategoryPicker, CategoryTag, newId, useCategories } from './categories.jsx'
import TimeSelect from './TimeSelect.jsx'
import { spanKey, timedSlots } from './events.js'
import { useReorder } from './drag.js'

export default function DayPanel({
  dateKey, day, recurring, holiday, onChange, onManageRecurring, onClose, onMove, initialTab = 'events',
  shared = [], uid, onOpenShared, onCreateShared, onSaveEvent, getRange,
}) {
  const [tab, setTab] = useState(initialTab)

  // Esc로 닫기, 좌우 방향키로 날짜 이동 (입력 중일 때는 제외)
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelectorAll('.modal-backdrop').length > 1) return
      if (e.key === 'Escape') onClose()
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (!typing && e.key === 'ArrowLeft') onMove(-1)
      if (!typing && e.key === 'ArrowRight') onMove(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onMove])

  const skipped = day.skipRecurring || []
  const fixedCount = recurring.filter((r) => !skipped.includes(r.id)).length
  const tabs = [
    ['events', '일정', day.events.length + shared.length],
    ['todos', '할 일', day.todos.length],
    ['timetable', '시간표', day.timetable.length + fixedCount + timedSlots(day.events).length],
  ]
  return (
    <div className="modal-backdrop day-backdrop" onClick={onClose}>
    <div className="modal day-modal" role="dialog" aria-label={formatLong(dateKey)} onClick={(e) => e.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="day-head">
        <button className="icon-btn" onClick={() => onMove(-1)} aria-label="전날">‹</button>
        <div className="day-title">
          <h3 className={holiday ? 'holiday' : ''}>{formatLong(dateKey)}</h3>
          {holiday && <span className="holiday-name">{holiday.join(' · ')}</span>}
        </div>
        <button className="icon-btn" onClick={() => onMove(1)} aria-label="다음 날">›</button>
        <button className="del big" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <div className="tabs">
        {tabs.map(([id, label, count]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}{count > 0 && <span className="count">{count}</span>}
          </button>
        ))}
      </div>
      {tab === 'events' && (
        <>
          {shared.length > 0 && <div className="shared-box">
            {shared.map((ev) => {
              const st = ev.members?.[uid]?.status
              return (
                <button key={ev.id} className={st === 'invited' ? 'shared-row invited' : 'shared-row'}
                  style={{ '--c': '#e93d82' }} onClick={() => onOpenShared(ev.id)}>
                  <div>
                    <strong>{ev.title}</strong>
                    <span className="muted small">
                      {ev.start}–{ev.end}{ev.place && ` · ${ev.place}`}{st === 'invited' && ' · 초대받음, 눌러서 답하기'}
                    </span>
                  </div>
                  <span className="chev">›</span>
                </button>
              )
            })}
          </div>}
          <Events key={dateKey} dateKey={dateKey} items={day.events} onChange={(events) => onChange({ ...day, events })}
            onCreateShared={onCreateShared} hasShared={shared.length > 0} onSaveEvent={onSaveEvent} getRange={getRange} />
        </>
      )}
      {tab === 'todos' && (
        <Todos items={day.todos} onChange={(todos) => onChange({ ...day, todos })} />
      )}
      {tab === 'timetable' && (
        <Timetable
          key={dateKey}
          items={day.timetable}
          events={day.events}
          onOpenEvents={() => setTab('events')}
          recurring={recurring}
          skipped={skipped}
          onChange={(timetable) => onChange({ ...day, timetable })}
          onSkip={(skipRecurring) => onChange({ ...day, skipRecurring })}
          onManageRecurring={onManageRecurring}
        />
      )}
    </div>
    </div>
  )
}

function Events({ dateKey, items, onChange, onCreateShared, hasShared, onSaveEvent, getRange }) {
  const { colorOf, defaultId } = useCategories()
  const blank = {
    title: '', memo: '', categoryId: defaultId, from: dateKey, to: dateKey, timed: false, startTime: '09:00', endTime: '10:00',
  }
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const { list, begin, dragging, refs } = useReorder(items, onChange)
  const formRef = useRef(null)
  // 입력칸을 열면 화면 안으로 끌어와 바로 보이게 합니다
  useEffect(() => { if (open) formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [open, editing])

  const close = () => { setForm(blank); setEditing(null); setOpen(false); setError('') }
  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError('제목을 입력하세요.')
    if (form.to < form.from) return setError('끝나는 날짜가 시작 날짜보다 빠를 수 없어요.')
    if (form.timed && form.from === form.to && toMinutes(form.endTime) <= toMinutes(form.startTime)) {
      return setError('끝나는 시간이 시작 시간보다 늦어야 해요.')
    }
    const prev = editing ? items.find((x) => x.id === editing) : { id: newId() }
    const item = { ...prev, title: form.title.trim(), memo: form.memo, categoryId: form.categoryId }
    if (form.timed) Object.assign(item, { startTime: form.startTime, endTime: form.endTime })
    else { delete item.startTime; delete item.endTime }
    // 오늘 하루짜리 일정은 바로 저장하고, 날짜를 옮기거나 늘리면 해당 날짜들을 함께 고칩니다
    if (!spanKey(prev) && form.from === dateKey && form.to === dateKey) {
      onChange(editing ? items.map((x) => (x.id === editing ? item : x)) : [...items, item])
    } else {
      onSaveEvent(item, form.from, form.to)
    }
    close()
  }
  const edit = (ev) => {
    setForm({
      title: ev.title, memo: ev.memo || '', categoryId: ev.categoryId || null, from: dateKey, to: dateKey,
      timed: Boolean(ev.startTime), startTime: ev.startTime || '09:00', endTime: ev.endTime || '10:00',
    })
    setEditing(ev.id)
    setOpen(true)
    if (spanKey(ev)) {
      getRange(ev).then(({ start, end }) => setForm((f) => ({ ...f, from: start, to: end }))).catch(() => {})
    }
  }
  const remove = (ev) => {
    if (spanKey(ev)) onSaveEvent(ev, null, null)
    else onChange(items.filter((x) => x.id !== ev.id))
    if (editing === ev.id) close()
  }

  return (
    <div className="tab-body">
      {open && (
        <form ref={formRef} className="form add-card" onSubmit={submit}>
          <div className="add-card-head">
            <strong>{editing ? '일정 수정' : '새 일정'}</strong>
            {!editing && (
              <button type="button" className="link-btn" onClick={() => { close(); onCreateShared() }}>친구와 약속으로</button>
            )}
          </div>
          <input placeholder="일정 제목" value={form.title} autoFocus={!editing}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="date-range">
            <input type="date" aria-label="시작 날짜" value={form.from}
              onChange={(e) => e.target.value && setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} />
            <span className="muted">~</span>
            <input type="date" aria-label="끝 날짜" value={form.to} min={form.from}
              onChange={(e) => e.target.value && setForm({ ...form, to: e.target.value })} />
          </div>
          <label className="time-toggle">
            <input type="checkbox" checked={form.timed} onChange={(e) => setForm({ ...form, timed: e.target.checked })} />
            시간 정하기
          </label>
          {form.timed && (
            <div className="row">
              <TimeSelect label="시작" value={form.startTime} onChange={(startTime) => setForm({ ...form, startTime })} />
              <span className="muted">~</span>
              <TimeSelect label="끝" value={form.endTime} onChange={(endTime) => setForm({ ...form, endTime })} />
            </div>
          )}
          <textarea placeholder="메모 (선택)" rows={1} value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          <CategoryPicker value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} />
          {error && <p className="error">{error}</p>}
          <div className="row-actions end">
            <button type="button" className="ghost-btn" onClick={close}>취소</button>
            <button className="primary-btn">{editing ? '수정' : '추가'}</button>
          </div>
        </form>
      )}
      {items.length === 0 && !hasShared && !open && <p className="empty">이 날의 일정이 없어요. + 를 눌러 추가하세요.</p>}
      {items.length > 1 && !open && <p className="muted small hint">⠿ 를 잡고 위아래로 끌면 순서를 바꿀 수 있어요.</p>}
      <ul className="list">
        {list.map((ev) => (
          <li key={ev.id} ref={(el) => { refs.current[ev.id] = el }}
            className={['event', editing === ev.id && 'editing', dragging && 'lifted-list'].filter(Boolean).join(' ')}
            style={{ '--c': colorOf(ev) }}>
            {items.length > 1 && (
              <button className="grip" aria-label="순서 바꾸기" onPointerDown={(e) => begin(e, ev.id)}>⠿</button>
            )}
            <div className="event-text" onClick={() => edit(ev)}>
              <div className="event-title"><strong>{ev.title}</strong><CategoryTag item={ev} /></div>
              {ev.startTime && <div className="event-when">{ev.startTime}–{ev.endTime}</div>}
              {ev.memo && <p>{ev.memo}</p>}
            </div>
            <button className="del" aria-label="삭제" onClick={() => remove(ev)}>×</button>
          </li>
        ))}
      </ul>
      {!open && <button className="fab" aria-label="일정 추가" onClick={() => setOpen(true)}>+</button>}
    </div>
  )
}

function Todos({ items, onChange }) {
  const [text, setText] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onChange([...items, { id: newId(), text: text.trim(), done: false }])
    setText('')
  }
  const done = items.filter((t) => t.done).length
  return (
    <div className="tab-body">
      <form className="form inline" onSubmit={submit}>
        <input placeholder="해야 할 일 입력 후 Enter" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="primary-btn">추가</button>
      </form>
      {items.length > 0 && (
        <div className="progress">
          <div className="bar"><div style={{ width: `${(done / items.length) * 100}%` }} /></div>
          <span>{done}/{items.length} 완료</span>
        </div>
      )}
      {items.length === 0 && <p className="empty">할 일을 추가해 보세요.</p>}
      <ul className="list">
        {items.map((t) => (
          <li key={t.id} className={t.done ? 'todo done' : 'todo'}>
            <label>
              <input type="checkbox" checked={t.done}
                onChange={() => onChange(items.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
              <span>{t.text}</span>
            </label>
            <button className="del" aria-label="삭제" onClick={() => onChange(items.filter((x) => x.id !== t.id))}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Timetable({ items, events, onOpenEvents, recurring, skipped, onChange, onSkip, onManageRecurring }) {
  const { colorOf, defaultId } = useCategories()
  const blank = { start: '09:00', end: '10:00', title: '', categoryId: defaultId }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const fixed = recurring.filter((r) => !skipped.includes(r.id)).map((r) => ({ ...r, fixed: true }))
  const hidden = recurring.filter((r) => skipped.includes(r.id))
  const sorted = [...items, ...fixed, ...timedSlots(events)].sort((a, b) => a.start.localeCompare(b.start))

  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError('내용을 입력하세요.')
    if (toMinutes(form.end) <= toMinutes(form.start)) return setError('끝나는 시간이 시작 시간보다 늦어야 해요.')
    setError('')
    onChange([...items, { ...form, title: form.title.trim(), id: newId() }])
    setForm({ ...form, title: '', start: form.end, end: nextHour(form.end) })
    setOpen(false)
  }

  // 타임라인 표시 범위: 기본 8~22시, 항목이 있으면 그만큼 넓힘
  const startHour = Math.min(8, ...sorted.map((x) => Math.floor(toMinutes(x.start) / 60)))
  const endHour = Math.max(22, ...sorted.map((x) => Math.ceil(toMinutes(x.end) / 60)))
  const HOUR = 44
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)

  return (
    <div className="tab-body">
      {open && (
      <form className="form add-card" onSubmit={submit}>
        <div className="add-card-head"><strong>새 시간표 항목</strong></div>
        <div className="row">
          <TimeSelect label="시작" value={form.start} onChange={(start) => setForm({ ...form, start })} />
          <span className="muted">~</span>
          <TimeSelect label="끝" value={form.end} onChange={(end) => setForm({ ...form, end })} />
        </div>
        <input placeholder="무엇을 하나요? (예: 수학 공부)" value={form.title} autoFocus
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <CategoryPicker value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} />
        <div className="row-actions end">
          <button type="button" className="ghost-btn" onClick={() => { setOpen(false); setError('') }}>취소</button>
          <button className="primary-btn">추가</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
      )}

      <div className="fixed-bar">
        <span className="muted small">
          고정 일정 {fixed.length}개가 들어 있어요{fixed.length > 0 && '. "이 날 빼기"를 누르면 이 날만 없어져요.'}
        </span>
        <button className="link-btn" onClick={onManageRecurring}>고정 일정 관리</button>
      </div>
      {hidden.length > 0 && (
        <div className="hidden-fixed">
          <span className="muted small">이 날 뺀 고정 일정:</span>
          {hidden.map((r) => (
            <button key={r.id} className="tag" onClick={() => onSkip(skipped.filter((id) => id !== r.id))}>
              {r.title} 다시 보기
            </button>
          ))}
        </div>
      )}

      <div className="timeline" style={{ height: (endHour - startHour) * HOUR }}>
        {hours.map((h) => (
          <div key={h} className="hour" style={{ top: (h - startHour) * HOUR }}>
            <span>{String(h).padStart(2, '0')}:00</span>
          </div>
        ))}
        {sorted.map((x) => {
          const top = ((toMinutes(x.start) - startHour * 60) / 60) * HOUR
          const height = Math.max(((toMinutes(x.end) - toMinutes(x.start)) / 60) * HOUR, 20)
          return (
            <div key={x.id} className={x.fixed ? 'block fixed' : x.fromEvent ? 'block from-event' : 'block'}
              style={{ top, height, '--c': colorOf(x) }} onClick={x.fromEvent ? onOpenEvents : undefined}>
              <div>
                <strong>{x.title}{x.fixed && <span className="fixed-mark">고정</span>}{x.fromEvent && <span className="fixed-mark">일정</span>}</strong>
                <span>{x.start}–{x.end}</span>
              </div>
              {x.fromEvent ? null : x.fixed
                ? <button className="skip-btn" title="이 날만 고정 일정 빼기" onClick={() => onSkip([...skipped, x.id])}>이 날 빼기</button>
                : <button className="del" aria-label="삭제" onClick={() => onChange(items.filter((y) => y.id !== x.id))}>×</button>}
            </div>
          )
        })}
      </div>
      {!open && <button className="fab" aria-label="시간표 추가" onClick={() => setOpen(true)}>+</button>}
    </div>
  )
}

function nextHour(t) {
  const m = Math.min(toMinutes(t) + 60, 23 * 60 + 59)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
