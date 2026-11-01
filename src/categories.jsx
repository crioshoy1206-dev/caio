import { createContext, useContext, useState } from 'react'

export const COLORS = [
  '#4f6bed', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6',
  '#12a594', '#e93d82', '#0090ff', '#f76b15', '#6e7781',
]
export const newId = () => Math.random().toString(36).slice(2, 10)

export const DEFAULT_CATEGORIES = [
  { id: 'school', name: '학교', color: '#4f6bed' },
  { id: 'friends', name: '친구', color: '#30a46c' },
  { id: 'family', name: '가족', color: '#f5a524' },
  { id: 'personal', name: '개인', color: '#8e4ec6' },
]
const UNCATEGORIZED = '#6e7781'

// 색이 꽉 찬 막대 위 글자색: 밝은 색(노랑 등)엔 어두운 글자, 진한 색엔 흰 글자
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? '#1d2130' : '#ffffff'
}

const CategoryContext = createContext(null)
export const CategoryProvider = CategoryContext.Provider

// 항목의 색은 카테고리에서 가져옵니다 (카테고리 색을 바꾸면 모든 항목에 반영)
export function useCategories() {
  const ctx = useContext(CategoryContext)
  const find = (item) => ctx.categories.find((c) => c.id === item.categoryId)
  return {
    ...ctx,
    find,
    colorOf: (item) => find(item)?.color || item.color || UNCATEGORIZED,
    defaultId: ctx.categories[0]?.id || null,
  }
}

export function CategoryPicker({ value, onChange }) {
  const { categories, openManager } = useCategories()
  const [open, setOpen] = useState(false)
  const cur = categories.find((c) => c.id === value)
  if (!open) {
    return (
      <div className="cat-picker">
        <button type="button" className={cur ? 'cat-chip on cat-current' : 'cat-chip cat-current'}
          style={{ '--c': cur?.color || '#6e7781' }} onClick={() => setOpen(true)}>
          <i />{cur ? cur.name : '카테고리 선택'}<span className="cat-caret">▾</span>
        </button>
      </div>
    )
  }
  return (
    <div className="cat-picker open">
      {categories.map((c) => (
        <button key={c.id} type="button"
          className={c.id === value ? 'cat-chip on' : 'cat-chip'}
          style={{ '--c': c.color }} onClick={() => { onChange(c.id); setOpen(false) }}>
          <i />{c.name}
        </button>
      ))}
      <button type="button" className="cat-chip add" onClick={openManager}>+ 카테고리</button>
    </div>
  )
}

export function CategoryTag({ item }) {
  const { find } = useCategories()
  const c = find(item)
  if (!c) return null
  return <span className="cat-tag" style={{ '--c': c.color }}>{c.name}</span>
}

export function ColorSwatches({ value, onChange }) {
  return (
    <div className="colors">
      {COLORS.map((c) => (
        <button key={c} type="button" aria-label="색상"
          className={c === value ? 'swatch on' : 'swatch'}
          style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

export function CategoryManager({ onClose }) {
  const { categories, setCategories } = useCategories()
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[5])
  const [editing, setEditing] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    if (editing) setCategories(categories.map((c) => (c.id === editing ? { ...c, name: name.trim(), color } : c)))
    else setCategories([...categories, { id: newId(), name: name.trim(), color }])
    setName('')
    setEditing(null)
  }
  const edit = (c) => { setName(c.name); setColor(c.color); setEditing(c.id) }
  const remove = (id) => {
    if (confirmId !== id) return setConfirmId(id)
    setConfirmId(null)
    setCategories(categories.filter((c) => c.id !== id))
    if (editing === id) { setName(''); setEditing(null) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>카테고리</h3>
            <p className="muted small">일정의 종류를 정하고 색을 지정해요. 색을 바꾸면 그 카테고리의 모든 일정에 반영돼요.</p>
          </div>
          <button className="del big" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <form className="form" onSubmit={submit}>
          <input placeholder="카테고리 이름 (예: 동아리, 학원)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="row">
            <ColorSwatches value={color} onChange={setColor} />
          </div>
          <div className="row-actions end">
            {editing && <button type="button" className="ghost-btn" onClick={() => { setName(''); setEditing(null) }}>취소</button>}
            <button className="primary-btn">{editing ? '수정' : '추가'}</button>
          </div>
        </form>
        <ul className="list">
          {categories.map((c) => (
            <li key={c.id} className={editing === c.id ? 'cat-row editing' : 'cat-row'} style={{ '--c': c.color }}>
              <button className="cat-row-main" onClick={() => edit(c)}>
                <i />{c.name}
              </button>
              {confirmId === c.id
                ? <button className="danger-btn" onClick={() => remove(c.id)}>삭제</button>
                : <button className="del" aria-label="삭제" onClick={() => remove(c.id)}>×</button>}
            </li>
          ))}
        </ul>
        {categories.length === 0 && <p className="empty">카테고리가 없어요. 위에서 추가해 보세요.</p>}
        <p className="muted small">카테고리를 지워도 일정은 남고, 회색 '미분류'로 보여요.</p>
      </div>
    </div>
  )
}
