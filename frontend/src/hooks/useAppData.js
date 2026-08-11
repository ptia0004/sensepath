import { useCallback, useEffect, useState } from 'react'
import { CBD, FALLBACK_REFUGES } from '../constants'
import { apiFetch, reportFromApi } from '../api/client'
import { refugeTypeFromApi } from '../utils/markers'

export function useAppData() {
  const [reports, setReports] = useState([])
  const [refuges, setRefuges] = useState(FALLBACK_REFUGES)
  const [modelStatus, setModelStatus] = useState('Checking model service...')
  const [booting, setBooting] = useState(true)
  const [bootMessage, setBootMessage] = useState('Connecting to SensePath services…')

  const loadReports = useCallback(async () => {
    try {
      const response = await apiFetch('/api/reports?limit=200')
      if (!response.ok) throw new Error(`Report API returned ${response.status}`)
      const body = await response.json()
      setReports((body.reports || []).map(reportFromApi))
    } catch (error) {
      console.warn('Community reports unavailable:', error)
    }
  }, [])

  const loadRefuges = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        latitude: String(CBD.lat),
        longitude: String(CBD.lng),
        radius_m: '2000',
        limit: '20',
      })
      const response = await apiFetch(`/api/refuges?${params}`)
      if (!response.ok) throw new Error(`Refuge API returned ${response.status}`)
      const body = await response.json()
      if (!body.refuges?.length) return
      setRefuges(
        body.refuges.map((item) => ({
          id: item.id,
          name: item.name,
          type: refugeTypeFromApi(item),
          lat: item.latitude,
          lng: item.longitude,
          distanceM: item.distance_m,
          source: item.source_file,
        })),
      )
    } catch (error) {
      console.warn('Using fallback refuge data:', error)
    }
  }, [])

  const checkModel = useCallback(async () => {
    try {
      const response = await apiFetch('/api/health')
      if (!response.ok) throw new Error('Health check failed')
      const body = await response.json()
      setModelStatus(
        `Model ${body.model_version} ready · three-source catalog ${
          body.refuge_catalog_loaded ? 'ready' : 'unavailable'
        }`,
      )
    } catch {
      setModelStatus('Model service unavailable. Start python run.py or use Cloud Run.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()
    const minDisplayMs = 900

    async function boot() {
      setBootMessage('Checking model service…')
      await checkModel()
      if (cancelled) return
      setBootMessage('Loading community reports…')
      await loadReports()
      if (cancelled) return
      setBootMessage('Loading nearby refuges…')
      await loadRefuges()
      if (cancelled) return
      setBootMessage('Ready')
      const elapsed = Date.now() - startedAt
      const wait = Math.max(0, minDisplayMs - elapsed)
      window.setTimeout(() => {
        if (!cancelled) setBooting(false)
      }, wait)
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [checkModel, loadReports, loadRefuges])

  return { reports, refuges, modelStatus, loadReports, setReports, booting, bootMessage }
}
