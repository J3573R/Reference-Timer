import { useState } from 'react'
import Modal from './Modal'
import type { ProgressivePreset, Stage } from '../types'

type SessionMode = 'simple' | 'class' | 'progressive'

export interface SessionConfig {
  mode: SessionMode
  timePerImage: number
  imageCount?: number
  preset?: string
  customStages?: Stage[]
}

interface SessionModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (config: SessionConfig) => void
  selectedCount: number
  presets: ProgressivePreset[]
  onSavePreset: (preset: ProgressivePreset) => void
}

const TIME_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
]

export default function SessionModal({
  isOpen,
  onClose,
  onStart,
  selectedCount,
  presets,
  onSavePreset
}: SessionModalProps) {
  const [mode, setMode] = useState<SessionMode>('simple')
  const [timePerImage, setTimePerImage] = useState(60)
  const [customTime, setCustomTime] = useState('')
  const [imageCount, setImageCount] = useState(10)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [customStages, setCustomStages] = useState<Stage[]>([
    { duration: 30, count: 5 },
    { duration: 60, count: 5 },
  ])
  const [newPresetName, setNewPresetName] = useState('')

  const handleTimePreset = (value: number) => {
    setTimePerImage(value)
    setCustomTime('')
  }

  const handleCustomTime = (value: string) => {
    setCustomTime(value)
    const seconds = parseInt(value) || 0
    if (seconds > 0) {
      setTimePerImage(seconds)
    }
  }

  const handleAddStage = () => {
    setCustomStages([...customStages, { duration: 60, count: 5 }])
  }

  const handleRemoveStage = (index: number) => {
    setCustomStages(customStages.filter((_, i) => i !== index))
  }

  const handleStageChange = (index: number, field: 'duration' | 'count', value: number) => {
    const newStages = [...customStages]
    newStages[index] = { ...newStages[index], [field]: value }
    setCustomStages(newStages)
  }

  const handleSavePreset = () => {
    if (newPresetName.trim() && customStages.length > 0) {
      onSavePreset({ name: newPresetName.trim(), stages: customStages })
      setNewPresetName('')
    }
  }

  const handleStart = () => {
    const config: SessionConfig = {
      mode,
      timePerImage,
    }

    if (mode === 'class') {
      config.imageCount = imageCount
    } else if (mode === 'progressive') {
      if (selectedPreset && selectedPreset !== 'custom') {
        config.preset = selectedPreset
      } else {
        config.customStages = customStages
      }
    }

    onStart(config)
  }

  const getProgressiveStages = (): Stage[] => {
    if (selectedPreset && selectedPreset !== 'custom') {
      const preset = presets.find(p => p.name === selectedPreset)
      return preset?.stages || []
    }
    return customStages
  }

  const getTotalImages = (): number => {
    if (mode === 'simple') return selectedCount
    if (mode === 'class') return Math.min(imageCount, selectedCount)
    return getProgressiveStages().reduce((sum, s) => sum + s.count, 0)
  }

  const getTotalTime = (): number => {
    if (mode === 'simple') return selectedCount * timePerImage
    if (mode === 'class') return Math.min(imageCount, selectedCount) * timePerImage
    return getProgressiveStages().reduce((sum, s) => sum + s.duration * s.count, 0)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins === 0) return `${secs}s`
    if (secs === 0) return `${mins}m`
    return `${mins}m ${secs}s`
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start Session">
      <div className="mode-tabs">
        {(['simple', 'class', 'progressive'] as const).map(m => (
          <button
            key={m}
            className={`mode-tab ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {(mode === 'simple' || mode === 'class') && (
        <div className="form-group">
          <label>Time per image</label>
          <div className="time-presets">
            {TIME_PRESETS.map(p => (
              <button
                key={p.value}
                className={`time-preset ${timePerImage === p.value && !customTime ? 'active' : ''}`}
                onClick={() => handleTimePreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Custom (seconds)"
            value={customTime}
            onChange={e => handleCustomTime(e.target.value)}
            style={{ marginTop: 8 }}
          />
        </div>
      )}

      {mode === 'class' && (
        <div className="form-group">
          <label>Number of images</label>
          <input
            type="number"
            min={1}
            max={selectedCount}
            value={imageCount}
            onChange={e => setImageCount(parseInt(e.target.value) || 1)}
          />
          <span style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'block' }}>
            {selectedCount} images available
          </span>
        </div>
      )}

      {mode === 'progressive' && (
        <>
          <div className="form-group">
            <label>Preset</label>
            <select
              value={selectedPreset}
              onChange={e => setSelectedPreset(e.target.value)}
            >
              <option value="">Select a preset...</option>
              {presets.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {(selectedPreset === 'custom' || selectedPreset === '') && (
            <div className="form-group">
              <label>Stages</label>
              <div className="stages-list">
                {customStages.map((stage, i) => (
                  <div key={i} className="stage-row">
                    <span style={{ color: '#888', width: 60 }}>Stage {i + 1}</span>
                    <input
                      type="number"
                      min={1}
                      value={stage.duration}
                      onChange={e => handleStageChange(i, 'duration', parseInt(e.target.value) || 1)}
                    />
                    <span style={{ color: '#888' }}>sec ×</span>
                    <input
                      type="number"
                      min={1}
                      value={stage.count}
                      onChange={e => handleStageChange(i, 'count', parseInt(e.target.value) || 1)}
                    />
                    <span style={{ color: '#888' }}>images</span>
                    {customStages.length > 1 && (
                      <button className="btn-icon" onClick={() => handleRemoveStage(i)}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary" onClick={handleAddStage} style={{ marginTop: 8 }}>
                + Add Stage
              </button>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Preset name"
                  value={newPresetName}
                  onChange={e => setNewPresetName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                >
                  Save Preset
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{
        marginTop: 20,
        padding: 12,
        background: '#1a1a1a',
        borderRadius: 8,
        fontSize: 13,
        color: '#888'
      }}>
        <strong style={{ color: '#e0e0e0' }}>Session summary:</strong><br />
        {getTotalImages()} images • {formatTime(getTotalTime())} total
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-large" onClick={handleStart}>
          Start Session
        </button>
      </div>
    </Modal>
  )
}
