import { useEffect, useRef, useState } from 'react'

// 달력 칸 찾기: 막대가 옆 칸까지 넘쳐 있어도 손가락 아래에 실제로 있는 칸을 고릅니다
export const keyAt = (x, y) =>
  document.elementsFromPoint(x, y).find((el) => el.classList?.contains('cell') && el.dataset.key)?.dataset.key || null

// 블록 끌어 옮기기: 마우스는 조금 움직이면, 터치는 꾹 누르고 있으면 시작합니다
export function useBlockDrag(onDrop) {
  const [drag, setDrag] = useState(null)
  const st = useRef(null)
  const justDragged = useRef(false)

  const stop = () => {
    const s = st.current
    if (!s) return
    clearTimeout(s.timer)
    window.removeEventListener('pointermove', s.move)
    window.removeEventListener('pointerup', s.up)
    window.removeEventListener('pointercancel', s.cancel)
    st.current = null
    setDrag(null)
  }
  useEffect(() => stop, [])

  const begin = (e, payload) => {
    if (e.button > 0) return
    stop()
    const s = { x0: e.clientX, y0: e.clientY, active: false }
    const activate = (x, y) => {
      s.active = true
      s.grab = keyAt(s.x0, s.y0) || payload.key
      navigator.vibrate?.(12)
      setDrag({ ...payload, x, y, target: keyAt(x, y) })
    }
    s.move = (ev) => {
      if (!s.active) {
        const dist = Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0)
        if (e.pointerType === 'mouse' && dist > 5) activate(ev.clientX, ev.clientY)
        else if (e.pointerType !== 'mouse' && dist > 10) stop()
        return
      }
      ev.preventDefault()
      setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY, target: keyAt(ev.clientX, ev.clientY) })
    }
    s.up = (ev) => {
      if (s.active) {
        justDragged.current = true
        setTimeout(() => { justDragged.current = false }, 80)
        const target = keyAt(ev.clientX, ev.clientY)
        // 잡은 칸 기준으로 몇 칸 움직였는지 계산하도록 잡은 위치를 key로 넘깁니다
        if (target) onDrop({ ...payload, grab: s.grab }, target)
      }
      stop()
    }
    s.cancel = stop
    if (e.pointerType !== 'mouse') s.timer = setTimeout(() => activate(s.x0, s.y0), 300)
    window.addEventListener('pointermove', s.move, { passive: false })
    window.addEventListener('pointerup', s.up)
    window.addEventListener('pointercancel', s.cancel)
    st.current = s
  }

  return { drag, begin, justDragged }
}

// 목록 안에서 위아래로 끌어 순서 바꾸기 (손잡이를 잡고 끕니다)
export function useReorder(items, onCommit) {
  const [order, setOrder] = useState(null)
  const refs = useRef({})
  const begin = (e, id) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    let current = items.map((x) => x.id)
    setOrder(current)
    const move = (ev) => {
      const others = current.filter((x) => x !== id)
      let idx = others.length
      for (let i = 0; i < others.length; i++) {
        const r = refs.current[others[i]]?.getBoundingClientRect()
        if (r && ev.clientY < r.top + r.height / 2) { idx = i; break }
      }
      const next = [...others.slice(0, idx), id, ...others.slice(idx)]
      if (next.join() !== current.join()) { current = next; setOrder(next) }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setOrder(null)
      const byId = Object.fromEntries(items.map((x) => [x.id, x]))
      if (current.join() !== items.map((x) => x.id).join()) onCommit(current.map((x) => byId[x]))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const list = order ? order.map((id) => items.find((x) => x.id === id)).filter(Boolean) : items
  return { list, begin, dragging: order !== null, refs }
}
