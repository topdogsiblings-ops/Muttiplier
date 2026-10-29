/** A suggested b-roll shot, written on a format's beat or in Settings (general product shots). */
export interface BrollSuggestion {
  description: string
}

/** Read a stored suggestions list defensively; empty descriptions are dropped. */
export function parseSuggestions(value: unknown): BrollSuggestion[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map(entry => ({ description: String(entry.description ?? '').trim() }))
    .filter(entry => entry.description)
}

/** A format's beat -> suggestions map. */
export function parseBeatSuggestions(value: unknown): Record<string, BrollSuggestion[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([beat, list]) => [beat, parseSuggestions(list)]))
}
