import { useEffect, useMemo, useState } from 'react'
import { readAllDays } from './store.js'
import { spanKey } from './events.js'
import { formatLong } from './date.js'
import { CategoryTag, useCategories } from './categories.jsx'
import { SearchIcon } from './icons.jsx'
import { SHARED_COLOR } from './Social.jsx'

// 모든 날짜의 일정, 시간표, 할 일, 친구 약속을 제목과 메모로 찾습니다
export default function SearchModal({ uid, shared, today, onPick, onClose }) {
  const { colorOf } = useCategories()
  const [all, setAll] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    readAllDays(uid).then(setAll).catch(() => setAll({}))
  }, [uid])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 검색 대상 목록: 여러 날 일정은 첫날 하나로 묶고 마지막 날을 함께 기억합니다
  const entries = useMemo(() => {
    if (!all) return []
    const out = []
    const spans = {}
    for (const key of Object.keys(all).sort()) {
      const day = all[key]
      for (const ev of day.events || []) {
        const g = spanKey(ev)
        if (g && spans[g]) { spans[g].end = key; continue }
        const entry = { kind: '일정', key, end: key, item: ev, text: `${ev.title} ${ev.memo || ''}` }
        if (g) spans[g] = entry
        out.push(entry)
      }
      for (const t of day.timetable || []) out.push({ kind: '시간표', key, end: key, item: t, text: t.title })
      for (const t of day.todos || []) out.push({ kind: '할 일', key, end: key, item: { title: t.text }, text: t.text, done: t.done })
    }
    for (const ev of shared) {
      out.push({ kind: '친구 약속', key: ev.date, end: ev.date, item: ev, text: `${ev.title} ${ev.place || ''} ${ev.memo || ''}`, shared: true })
    }
    return out
  }, [all, shared])

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hits = words.length
    ? entries.filter((e) => words.every((w) => e.text.toLowerCase().includes(w)))
    : []
  const upcoming = hits.filter((e) => e.end >= today).sort((a, b) => a.key.localeCompare(b.key))
  const past = hits.filter((e) => e.end < today).sort((a, b) => b.key.localeCompare(a.key))

  const Row = ({ e }) => {
    const c = e.shared ? SHARED_COLOR : colorOf(e.item)
    const time = e.item.startTime ? `${e.item.startTime}–${e.item.endTime}` : e.item.start ? `${e.item.start}–${e.item.end}` : ''
    return (
      <li>
        <button className="search-row" style={{ '--c': c }} onClick={() => onPick(e.key)}>
          <span className="search-date">
            {formatLong(e.key)}{e.end !== e.key && ` ~ ${e.end.slice(5).replace('-', '/')}`}
          </span>
          <span className="search-title">
            <strong className={e.done ? 'done' : ''}>{e.item.title}</strong>
            {!e.shared && e.kind !== '할 일' && <CategoryTag item={e.item} />}
          </span>
          <span className="muted small">{e.kind}{time && ` · ${time}`}{e.item.place && ` · ${e.item.place}`}</span>
        </button>
      </li>
    )
  }

  return (
    <div className="modal-backdrop search-backdrop" onClick={onClose}>
      <div className="modal search-modal" role="dialog" aria-label="일정 검색" onClick={(e) => e.stopPropagation()}>
        <div className="search-bar">
          <SearchIcon />
          <input id="search-input" type="search" placeholder="일정, 할 일, 시간표 검색" value={q} autoFocus
            onChange={(e) => setQ(e.target.value)} />
          <button className="ghost-btn" onClick={onClose}>닫기</button>
        </div>
        {!all && <p className="empty">불러오는 중…</p>}
        {all && !words.length && <p className="empty">찾을 일정 제목이나 메모를 입력하세요.</p>}
        {all && words.length > 0 && hits.length === 0 && <p className="empty">'{q.trim()}'에 맞는 일정이 없어요.</p>}
        {upcoming.length > 0 && (
          <>
            <h4 className="search-group">다가오는 일정 {upcoming.length}</h4>
            <ul className="search-list">{upcoming.slice(0, 100).map((e, i) => <Row key={'u' + i} e={e} />)}</ul>
          </>
        )}
        {past.length > 0 && (
          <>
            <h4 className="search-group">지난 일정 {past.length}</h4>
            <ul className="search-list">{past.slice(0, 100).map((e, i) => <Row key={'p' + i} e={e} />)}</ul>
          </>
        )}
      </div>
    </div>
  )
}
