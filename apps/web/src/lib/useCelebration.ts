import { useCallback, useEffect, useRef, useState } from 'react'
import { playCelebrationSound } from './celebration'

export function useCelebration(durationMs = 2500) {
  const [active, setActive] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A timer still pending when the component goes away must not fire afterwards: it would set
  // state on an unmounted tree (and, in a slow test run, after the DOM environment is gone).
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const trigger = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setActive(true)
    playCelebrationSound()
    timeoutRef.current = setTimeout(() => setActive(false), durationMs)
  }, [durationMs])

  return { active, trigger }
}
