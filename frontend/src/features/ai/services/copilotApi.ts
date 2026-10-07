import type { CopilotResponse } from '../types/ai'

const apiBaseUrl = (import.meta.env.VITE_GIS_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export class CopilotApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CopilotApiError'
    this.status = status
  }
}

export async function queryCopilot(
  message: string,
  selectedLocation: { latitude: number; longitude: number } | null,
): Promise<CopilotResponse> {
  const response = await fetch(`${apiBaseUrl}/api/copilot/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, selected_location: selectedLocation }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null
    throw new CopilotApiError(payload?.detail || `GIS service returned ${response.status}`, response.status)
  }
  return await response.json() as CopilotResponse
}
