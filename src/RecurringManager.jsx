import { useState } from 'react'
import { toMinutes, WEEKDAYS } from './date.js'
import { CategoryPicker, newId, useCategories } from './categories.jsx'
import TimeSelect from './TimeSelect.jsx'

// 월~일 순서로 보여 줍니다 (Date.getDay 기준 값: 일=0)
const ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function RecurringManager({ items, onChange, onClose }) {
  const { colorOf, categories } = useCategories()
  const school = categories.find((c) => c.name === '학교') || categories[0]
  const blank = { title: '', weekdays: [1], start: '09:00', end: '09:50', categoryId: school?.id || null, from: '', until: '', showInCalendar: false }
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const toggleDay = (d) => setForm((f) => ({
    ...f,
    weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d],
  }))

  const submit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return setError('내용을 입력하세요.')
    if (!form.weekdays.length) return setError('요일을 하나 이상 고르세요.')
    if (toMinutes(form.end) <= toMinutes(form.start)) return setError('끝나는 시간이 시작 시간보다 늦어야 해요.')
    if (form.from && form.until && form.until < form.from) return setError('기간의 끝 날짜가 시작 날짜보다 늦어야 해요.')
    setError('')
    const item = { ...form, title: form.title.trim(), id: editing || newId() }
    onChange(editing ? items.map((x) => (x.id === editing ? item : x)) : [...items, item])
    // 같은 요일·기간으로 다음 교시를 바로 이어서 넣기 쉽게 시간만 넘겨 둡니다
    setForm({ ...form, title: '', start: form.end, end: addMinutes(form.end, toMinutes(form.end) - toMinutes(form.start)) })
    setEditing(null)
  }

  const edit = (r) => {
    setForm({ ...blank, ...r })
    setEditing(r.id)
    setError('')
  }
  const remove = (id) => {
    // 한 번 누르면 확인 상태, 한 번 더 누르면 삭제
    if (confirmId !== id) return setConfirmId(id)
    setConfirmId(null)
    onChange(items.filter((x) => x.id !== id))
    if (editing === id) { setForm(blank); setEditing(null) }
  }

  // 주간 표 범위
  const startHour = Math.min(8, ...items.map((x) => Math.floor(toMinutes(x.start) / 60)))
  const endHour = Math.max(18, ...items.map((x) => Math.ceil(toMinutes(x.end) / 60)))
  const HOUR = 48
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  // 주말에도 바로 넣을 수 있게 월~일 7칸을 항상 보여 줍니다
  const columns = ORDER

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>고정 일정</h3>
            <p className="muted small">학교 시간표처럼 매주 같은 요일에 반복되는 일정이에요. 해당 날짜의 시간표에 자동으로 들어가요.</p>
          </div>
          <button className="del big" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="modal-body">
          <form className="form recurring-form" onSubmit={submit}>
            <input placeholder="과목 / 일정 이름 (예: 국어, 영어학원)" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="weekday-picks">
              {ORDER.map((d) => (
                <button key={d} type="button"
                  className={form.weekdays.includes(d) ? 'on' : ''}
                  onClick={() => toggleDay(d)}>{WEEKDAYS[d]}</button>
              ))}
            </div>
            <div className="row">
              <TimeSelect label="시작" value={form.start} onChange={(start) => setForm({ ...form, start })} />
              <span className="muted">~</span>
              <TimeSelect label="끝" value={form.end} onChange={(end) => setForm({ ...form, end })} />
            </div>
            <div className="period">
              <span className="muted small">적용 기간 (비워 두면 계속)</span>
              <div className="row">
                <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                <span className="muted">~</span>
                <input type="date" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
              </div>
            </div>
            <CategoryPicker value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId })} />
            <label className="check-row">
              <input type="checkbox" checked={!!form.showInCalendar}
                onChange={(e) => setForm({ ...form, showInCalendar: e.target.checked })} />
              <span>월간 캘린더에도 표시 <span className="muted small">(끄면 시간표에서만 보여요)</span></span>
            </label>
            <div className="row">
              <div className="row-actions end">
                {editing && <button type="button" className="ghost-btn" onClick={() => { setForm(blank); setEditing(null) }}>취소</button>}
                <button className="primary-btn">{editing ? '수정' : '추가'}</button>
              </div>
            </div>
            {error && <p className="error">{error}</p>}
          </form>

          <div className="week-view">
            {items.length === 0 && <p className="empty">아직 고정 일정이 없어요. 위에서 추가해 보세요.</p>}
            {items.length > 0 && (
              <div className="week-grid" style={{ '--cols': columns.length }}>
                <div className="week-head">
                  <div />
                  {columns.map((d) => <div key={d}>{WEEKDAYS[d]}</div>)}
                </div>
                <div className="week-body" style={{ height: (endHour - startHour) * HOUR }}>
                  <div className="week-hours">
                    {hours.map((h) => (
                      <span key={h} style={{ top: (h - startHour) * HOUR }}>{String(h).padStart(2, '0')}</span>
                    ))}
                  </div>
                  {columns.map((d) => (
                    <div key={d} className="week-col">
                      {hours.map((h) => <div key={h} className="week-line" style={{ top: (h - startHour) * HOUR }} />)}
                      {items.filter((r) => r.weekdays.includes(d)).map((r) => (
                        <button key={r.id}
                          className={editing === r.id ? 'week-block editing' : 'week-block'}
                          style={{
                            '--c': colorOf(r),
                            top: ((toMinutes(r.start) - startHour * 60) / 60) * HOUR,
                            height: Math.max(((toMinutes(r.end) - toMinutes(r.start)) / 60) * HOUR, 18),
                          }}
                          onClick={() => edit(r)} title={`${r.title} ${r.start}–${r.end}`}>
                          <strong>{r.title}</strong>
                          <span>{r.start}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {items.length > 0 && (
              <ul className="list recurring-list">
                {[...items].sort((a, b) => a.start.localeCompare(b.start)).map((r) => (
                  <li key={r.id} className="event" style={{ '--c': colorOf(r) }}>
                    <div className="event-text" onClick={() => edit(r)}>
                      <strong>{r.title}</strong>
                      <p>
                        매주 {ORDER.filter((d) => r.weekdays.includes(d)).map((d) => WEEKDAYS[d]).join('·')} {r.start}–{r.end}
                        {(r.from || r.until) && ` · ${r.from || '처음'} ~ ${r.until || '계속'}`}
                      </p>
                    </div>
                    <button
                      className={r.showInCalendar ? 'cal-toggle on' : 'cal-toggle'}
                      aria-pressed={!!r.showInCalendar}
                      title="월간 캘린더에 표시"
                      onClick={() => onChange(items.map((x) => (x.id === r.id ? { ...x, showInCalendar: !x.showInCalendar } : x)))}>
                      캘린더 {r.showInCalendar ? 'O' : 'X'}
                    </button>
                    {confirmId === r.id
                      ? <button className="danger-btn" onClick={() => remove(r.id)}>모든 날짜에서 삭제</button>
                      : <button className="del" aria-label="삭제" onClick={() => remove(r.id)}>×</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function addMinutes(t, mins) {
  const m = Math.min(toMinutes(t) + Math.max(mins, 10), 23 * 60 + 59)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
