import { useState, useEffect, useCallback, useRef } from 'react'

interface UseTimerOptions {
  duration: number
  onComplete: () => void
}

export function useTimer({ duration, onComplete }: UseTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onComplete)

  onCompleteRef.current = onComplete

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer()
          onCompleteRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clearTimer])

  useEffect(() => {
    if (!isPaused && timeLeft > 0) {
      startTimer()
    }
    return clearTimer
  }, [isPaused, startTimer, clearTimer])

  const reset = useCallback((newDuration: number) => {
    clearTimer()
    setTimeLeft(newDuration)
    setIsPaused(false)
  }, [clearTimer])

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  return { timeLeft, isPaused, togglePause, reset }
}
