import { useEffect, useState } from 'react'

const MODES = [
  ['system', '자동', '시스템 설정 따라가기'],
  ['light', '라이트', '라이트 테마'],
  ['dark', '다크', '다크 테마'],
]
const KEY = 'my-calendar-theme'

function applyTheme(mode) {
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}

// 로그인 화면에서도 저장된 테마가 바로 적용되도록 불러올 때 한 번 적용
try { applyTheme(localStorage.getItem(KEY) || 'system') } catch { /* 저장 불가 환경 */ }

export default function ThemeToggle() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
  })
  useEffect(() => {
    applyTheme(mode)
    try { localStorage.setItem(KEY, mode) } catch { /* 저장 불가 환경 */ }
  }, [mode])

  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {MODES.map(([id, icon, label]) => (
        <button key={id} className={mode === id ? 'on' : ''} title={label} aria-label={label}
          aria-pressed={mode === id} onClick={() => setMode(id)}>{icon}</button>
      ))}
    </div>
  )
}
