import { useState, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useTimer } from '../hooks/useTimer'
import type { SessionConfig } from './SessionModal'
import type { Stage, Session, SessionImage } from '../types'
import { useImagePrefetch } from '../hooks/useImagePrefetch'

interface SessionViewProps {
  config: SessionConfig
  images: string[]
  presets: { name: string; stages: Stage[] }[]
  audioChime: boolean
  onEnd: (session: Session) => void
  onBack: () => void
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
}

function buildSessionQueue(
  config: SessionConfig,
  images: string[],
  presets: { name: string; stages: Stage[] }[]
): { imagePath: string; duration: number; stageName?: string }[] {
  const queue: { imagePath: string; duration: number; stageName?: string }[] = []

  if (config.mode === 'simple') {
    for (const img of images) {
      queue.push({ imagePath: img, duration: config.timePerImage })
    }
  } else if (config.mode === 'class') {
    const count = Math.min(config.imageCount || 10, images.length)
    for (let i = 0; i < count; i++) {
      queue.push({ imagePath: images[i], duration: config.timePerImage })
    }
  } else if (config.mode === 'progressive') {
    let stages: Stage[]
    let stageName: string | undefined

    if (config.preset) {
      const preset = presets.find(p => p.name === config.preset)
      stages = preset?.stages || []
      stageName = config.preset
    } else {
      stages = config.customStages || []
    }

    let imageIndex = 0
    for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
      const stage = stages[stageIdx]
      for (let i = 0; i < stage.count; i++) {
        queue.push({
          imagePath: images[imageIndex % images.length],
          duration: stage.duration,
          stageName: stageName ? `${stageName} - Stage ${stageIdx + 1}` : `Stage ${stageIdx + 1}`,
        })
        imageIndex++
      }
    }
  }

  return queue
}

export default function SessionView({
  config,
  images,
  presets,
  audioChime,
  onEnd,
  onBack,
  thumbnailCacheRef
}: SessionViewProps) {
  const [queue] = useState(() => buildSessionQueue(config, images, presets))
  const imagePaths = useMemo(() => queue.map(q => q.imagePath), [queue])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([])
  const [startTime] = useState(Date.now())
  const [imageStartTime, setImageStartTime] = useState(Date.now())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const current = queue[currentIndex]
  const { isLoaded } = useImagePrefetch(currentIndex, imagePaths)
  const [fullResLoaded, setFullResLoaded] = useState(false)
  const waitingForLoadRef = useRef(true)

  const recordImageTime = useCallback(() => {
    const timeSpent = Math.round((Date.now() - imageStartTime) / 1000)
    setSessionImages(prev => [...prev, { path: current.imagePath, timeSpent }])
  }, [current?.imagePath, imageStartTime])

  const goToNext = useCallback(() => {
    if (audioChime) {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.value = 0.1
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    }

    recordImageTime()

    if (currentIndex >= queue.length - 1) {
      setIsComplete(true)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }, [currentIndex, queue.length, recordImageTime, audioChime])

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      recordImageTime()
      setCurrentIndex(prev => prev - 1)
      setSessionImages(prev => prev.slice(0, -1))
    }
  }, [currentIndex, recordImageTime])

  const { timeLeft, isPaused, togglePause, reset, resetAndStop } = useTimer({
    duration: current?.duration || 60,
    onComplete: goToNext,
  })

  const handleResetTimer = useCallback(() => {
    if (current) {
      waitingForLoadRef.current = false
      resetAndStop(current.duration)
    }
  }, [current, resetAndStop])

  const handleTogglePause = useCallback(() => {
    waitingForLoadRef.current = false
    togglePause()
  }, [togglePause])

  // When image changes: check if already prefetched, pause timer until loaded
  useEffect(() => {
    if (!current) return

    if (isLoaded(current.imagePath)) {
      setFullResLoaded(true)
      waitingForLoadRef.current = false
      reset(current.duration)
      setImageStartTime(Date.now())
    } else {
      setFullResLoaded(false)
      waitingForLoadRef.current = true
      resetAndStop(current.duration)
    }
  }, [currentIndex, current, reset, resetAndStop, isLoaded])

  // Start timer when full-res image finishes loading (only if waiting for load, not user-paused)
  useEffect(() => {
    if (fullResLoaded && current && waitingForLoadRef.current) {
      waitingForLoadRef.current = false
      reset(current.duration)
      setImageStartTime(Date.now())
    }
  }, [fullResLoaded, current, reset])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handleTogglePause()
      } else if (e.code === 'ArrowRight') {
        goToNext()
      } else if (e.code === 'ArrowLeft') {
        goToPrevious()
      } else if (e.code === 'KeyR') {
        handleResetTimer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTogglePause, goToNext, goToPrevious, handleResetTimer])

  const handleEndSession = useCallback(() => {
    const timeSpent = Math.round((Date.now() - imageStartTime) / 1000)
    const currentImage = { path: current.imagePath, timeSpent }
    const allImages = [...sessionImages, currentImage]

    const totalTime = Math.round((Date.now() - startTime) / 1000)
    const session: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: config.mode,
      preset: config.preset,
      totalTime,
      complete: false,
      images: allImages,
    }
    onEnd(session)
  }, [current?.imagePath, imageStartTime, startTime, config, sessionImages, onEnd])

  const handleComplete = useCallback(() => {
    const totalTime = Math.round((Date.now() - startTime) / 1000)
    const session: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: config.mode,
      preset: config.preset,
      totalTime,
      complete: true,
      images: sessionImages,
    }
    onEnd(session)
  }, [startTime, config, sessionImages, onEnd])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${secs}`
  }

  if (isComplete) {
    const totalTime = Math.round((Date.now() - startTime) / 1000)
    return (
      <div className="session-complete">
        <h1>Session Complete!</h1>
        <div className="session-stats">
          <div className="stat">
            <div className="stat-value">{sessionImages.length}</div>
            <div className="stat-label">Images</div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatTime(totalTime)}</div>
            <div className="stat-label">Total Time</div>
          </div>
        </div>
        <div className="session-complete-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            Back to Browser
          </button>
          <button className="btn btn-primary" onClick={handleComplete}>
            Save & Exit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="session-view">
      <div className={`session-image ${isPaused ? 'paused' : ''}`}>
        <div className="session-image-wrapper">
          {!fullResLoaded && !isLoaded(current.imagePath) && thumbnailCacheRef.current[current.imagePath] && (
            <img
              className="session-image-thumbnail"
              src={`file://${thumbnailCacheRef.current[current.imagePath]}`}
              alt=""
            />
          )}
          <img
            className="session-image-full"
            src={`file://${current.imagePath}`}
            alt=""
            onLoad={() => setFullResLoaded(true)}
            style={{ opacity: fullResLoaded || isLoaded(current.imagePath) ? 1 : 0 }}
          />
        </div>
        {isPaused && <div className="paused-indicator">||</div>}
      </div>

      <div className="session-overlay">
        <div className={`session-timer ${timeLeft <= 5 ? 'warning' : ''}`}>
          {formatTime(timeLeft)}
        </div>
        <div className="session-progress">
          <span>{currentIndex + 1} / {queue.length}</span>
          {current.stageName && (
            <span className="session-stage">{current.stageName}</span>
          )}
        </div>
        <div className="session-reset">
          <button className="session-btn" onClick={handleResetTimer} title="Reset timer (R)">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3.5 2.5v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 7.5A7 7 0 1 1 3 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="session-controls">
          <button className="session-btn" onClick={goToPrevious} disabled={currentIndex === 0}>
            &lt;
          </button>
          <button className="session-btn primary" onClick={handleTogglePause}>
            {isPaused ? '>' : '||'}
          </button>
          <button className="session-btn" onClick={goToNext}>
            &gt;
          </button>
        </div>
      </div>

      <button className="session-btn end" onClick={() => setShowConfirm(true)}>
        End Session
      </button>

      {showConfirm && (
        <div className="confirm-dialog">
          <div className="confirm-dialog-content">
            <p>End session early? Progress will be saved.</p>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleEndSession}>
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
