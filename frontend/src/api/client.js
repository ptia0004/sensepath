/**
 * API client
 * - On GitHub Pages → call Cloud Run
 * - On localhost Vite → use /api proxy to Flask
 * - On Cloud Run same-origin page → relative /api
 */
import { CLOUD_API_BASE } from '../constants'

function resolveApiBase() {
  const host = window.location.hostname
  if (host === 'ptia0004.github.io' || host.endsWith('.github.io')) {
    return CLOUD_API_BASE
  }
  return ''
}

export const API_BASE = resolveApiBase()

export const API_HELP = API_BASE
  ? `Cannot connect to the SensePath cloud API at ${API_BASE}.`
  : 'Cannot connect to the SensePath API. Run "python run.py" (port 5001) and keep Vite proxy enabled, or open the Cloud Run URL.'

export async function apiFetch(path, options) {
  if (window.location.protocol === 'file:') {
    throw new Error(API_HELP)
  }
  return fetch(API_BASE + path, options)
}

export function apiErrorMessage(error) {
  if (error && (error.message === 'Failed to fetch' || error instanceof TypeError)) {
    return API_HELP
  }
  return error?.message || 'The request could not be completed.'
}

export function reportFromApi(item) {
  const created = new Date(item.created_at)
  const minsAgo = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000))
  return {
    id: item.id,
    type: item.category,
    title: item.category_name,
    street: item.location_label || 'Approximate map location',
    comment: item.comment || '',
    minsAgo,
    lat: item.latitude,
    lng: item.longitude,
    expiresAt: item.expires_at,
  }
}
