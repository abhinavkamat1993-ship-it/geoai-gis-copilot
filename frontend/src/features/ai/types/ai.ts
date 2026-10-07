export type ChatMessage = {
  role: 'user' | 'ai'
  text: string
  analysis?: string[]
  warnings?: string[]
  trust?: Record<string, string>
  results?: Array<{
    id: string
    layer: string
    attributes: Record<string, unknown>
    distance_m: number | null
  }>
}

export type CopilotFeature = {
  id: string
  layer: string
  attributes: Record<string, unknown>
  geometry: Record<string, unknown> | null
  distance_m: number | null
}

export type CopilotResponse = {
  success: boolean
  intent: Record<string, unknown> | null
  summary: string
  features: CopilotFeature[]
  analysis_geometry: Record<string, unknown> | null
  analysis: string[]
  warnings: string[]
  clarification: string | null
  trust: Record<string, string>
}
