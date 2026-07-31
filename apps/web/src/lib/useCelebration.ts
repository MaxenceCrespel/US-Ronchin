import { useCallback, useRef, useState } from 'react'
import { playCelebrationSound } from './celebration'

export function useCelebration(durationMs = 2500) {
  const [active, setActive] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trigger = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setActive(true)
    playCelebrationSound()
    timeoutRef.current = setTimeout(() => setActive(false), durationMs)
  }, [durationMs])

  return { active, trigger }
}
