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

  // Keep onComplete ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Timer effect - runs when isPaused changes or timeLeft becomes > 0
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Don't start if paused or time is up
    if (isPaused || timeLeft <= 0) {
      return
    }

    // Start the interval
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          onCompleteRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPaused, timeLeft > 0]) // Only re-run when pause state changes or timer starts/stops

  const reset = useCallback((newDuration: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setTimeLeft(newDuration)
    setIsPaused(false)
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  return { timeLeft, isPaused, togglePause, reset }
}
