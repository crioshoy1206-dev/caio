import { useEffect, useState } from 'react'

// 안드로이드 크롬은 설치 창을 띄울 수 있게 이벤트를 주고, 아이폰은 사파리 공유 메뉴로 직접 추가해야 합니다
let deferredPrompt = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    listeners.forEach((fn) => fn())
  })
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export default function InstallRow() {
  const [, rerender] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  useEffect(() => {
    const fn = () => rerender((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  if (isStandalone()) return null

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice.catch(() => {})
      deferredPrompt = null
      rerender((n) => n + 1)
    } else {
      setShowHelp((v) => !v)
    }
  }

  return (
    <button className="setting-row link" onClick={install}>
      <div>
        <strong>휴대폰에 앱으로 설치</strong>
        <p className="muted small">
          {!showHelp && '홈 화면에 아이콘을 만들어 앱처럼 열어요.'}
          {showHelp && isIOS() && '사파리 아래쪽 공유 버튼(□↑)을 누르고 "홈 화면에 추가"를 고르세요.'}
          {showHelp && !isIOS() && '크롬 오른쪽 위 ⋮ 메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 고르세요.'}
        </p>
      </div>
      <span className="chev">›</span>
    </button>
  )
}
