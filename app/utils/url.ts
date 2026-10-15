/** Trimmed URL with a scheme (https:// is assumed when missing), or null when empty. */
export function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/** Empty counts as valid: the source link is optional. */
export function isValidUrl(value: string | null | undefined): boolean {
  const url = normalizeUrl(value)
  if (!url) return true
  try {
    return !!new URL(url).hostname.includes('.')
  } catch {
    return false
  }
}
