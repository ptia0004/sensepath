import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PREFERENCES, PREFERENCES_KEY } from '../constants'

export function usePreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [status, setStatus] = useState('')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}')
      setPreferences((prev) => ({
        crowdTolerance: ['low', 'medium', 'high'].includes(saved.crowdTolerance)
          ? saved.crowdTolerance
          : prev.crowdTolerance,
        avoidLoud: typeof saved.avoidLoud === 'boolean' ? saved.avoidLoud : prev.avoidLoud,
        avoidRoadworks:
          typeof saved.avoidRoadworks === 'boolean' ? saved.avoidRoadworks : prev.avoidRoadworks,
      }))
    } catch (error) {
      console.warn('Saved preferences could not be loaded:', error)
    }
  }, [])

  const save = useCallback(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
    setStatus('Preferences saved and applied.')
  }, [preferences])

  return { preferences, setPreferences, status, save }
}
