type Color = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export const BRAND_STATUSES = ['prospect', 'auditioning', 'active', 'paused'] as const

export const BRAND_STATUS_COLORS: Record<string, Color> = {
  prospect: 'neutral',
  auditioning: 'info',
  active: 'success',
  paused: 'warning'
}

export const PAY_MODELS = [
  { label: 'Flat fee', value: 'flat' },
  { label: 'Commission', value: 'commission' },
  { label: 'Flat fee + commission', value: 'both' }
]

export const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'].map(code => ({ label: code, value: code }))

export function currencySymbol(code: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(part => part.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

/** "£150 / video + 10% commission", or null when no terms are set. */
export function dealSummary(brand: {
  pay_model: string | null
  flat_fee: number | null
  commission_pct: number | null
  currency: string
}): string | null {
  const parts: string[] = []
  if (brand.pay_model !== 'commission' && brand.flat_fee !== null) parts.push(`${formatMoney(Number(brand.flat_fee), brand.currency)} / video`)
  if (brand.pay_model !== 'flat' && brand.commission_pct !== null) parts.push(`${Number(brand.commission_pct)}% commission`)
  if (parts.length) return parts.join(' + ')
  return PAY_MODELS.find(model => model.value === brand.pay_model)?.label ?? null
}

/** Form state for BrandDealFields from a brand row (or blank for a new brand). */
export function toBrandDeal(brand?: {
  pay_model: string | null
  flat_fee: number | null
  commission_pct: number | null
  currency: string
  trybe_score: number | null
  trybe_url: string | null
}) {
  return {
    pay_model: brand?.pay_model ?? undefined,
    flat_fee: brand?.flat_fee ?? undefined,
    commission_pct: brand?.commission_pct ?? undefined,
    currency: brand?.currency ?? 'GBP',
    trybe_score: brand?.trybe_score ?? undefined,
    trybe_url: brand?.trybe_url ?? ''
  }
}

/** Column values to save from BrandDealFields. Amounts that don't apply to the pay model are cleared. */
export function fromBrandDeal(deal: ReturnType<typeof toBrandDeal>) {
  const number = (value: number | undefined | string) => value === undefined || value === '' || Number.isNaN(Number(value)) ? null : Number(value)
  return {
    pay_model: deal.pay_model ?? null,
    flat_fee: deal.pay_model === 'flat' || deal.pay_model === 'both' ? number(deal.flat_fee) : null,
    commission_pct: deal.pay_model === 'commission' || deal.pay_model === 'both' ? number(deal.commission_pct) : null,
    currency: deal.currency,
    trybe_score: number(deal.trybe_score),
    trybe_url: normalizeUrl(deal.trybe_url)
  }
}

export const SHOOT_STATUS_COLORS: Record<string, Color> = {
  draft: 'neutral',
  planned: 'info',
  shooting: 'warning',
  filmed: 'success',
  edited: 'success',
  ingested: 'success',
  rendering: 'warning',
  done: 'primary'
}

export const ITEM_STATUS_COLORS: Record<string, Color> = {
  planned: 'neutral',
  filmed: 'success',
  skipped: 'warning'
}

export const KIND_LABELS = { hook: 'Hook', body: 'VO', cta: 'CTA' } as const

export const selectOptions = (values: readonly string[]) =>
  values.map(value => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value }))

export function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatNumber = (value: number, digits = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits })
