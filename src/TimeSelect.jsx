// 10분 단위 시간 선택 (시 / 분 두 칸)
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = ['00', '10', '20', '30', '40', '50']

export default function TimeSelect({ value, onChange, label }) {
  const [h, m] = value.split(':')
  // 예전에 1분 단위로 저장된 값도 그대로 보이도록
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()
  return (
    <div className="time-select" role="group" aria-label={label}>
      <select value={h} aria-label={`${label} 시`} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {HOURS.map((x) => <option key={x} value={x}>{x}시</option>)}
      </select>
      <select value={m} aria-label={`${label} 분`} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {minutes.map((x) => <option key={x} value={x}>{x}분</option>)}
      </select>
    </div>
  )
}
