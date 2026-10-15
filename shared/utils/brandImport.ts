// Brand import from a Scrybe CSV export, any version.
// Columns are matched by meaning rather than exact name, values are read leniently, and
// columns we don't recognise are kept on the brand as extra Trybe data rather than dropped.
// Pure: parsing and planning are unit-tested; the Brands page does the writes.
import { slugify } from './slots'

/** Everything Scrybe exports that has no dedicated brand column. Stored as brands.trybe_data. */
export interface TrybeData {
  /** the file's header row, so it's clear which export a brand came from */
  source_columns: string[]
  matched: 'yes' | 'no' | 'unknown' | null
  match_notes: string[]
  pay_types: string[]
  commission_pct: number | null
  ad_spend_pct: number | null
  flat_per_video: number | null
  flat_per_order: number | null
  retainer: number | null
  /** 'none' when Trybe states there is no cap */
  cap: number | 'none' | null
  pay_terms: string[]
  rating: number | null
  reviews: number | null
  creator_earnings: string | null
  total_creators: number | null
  categories: string[]
  new: boolean | null
  samples: boolean | null
  top_products: string[]
  about: string | null
  logo: string | null
  scanned_on: string | null
  /** columns this importer doesn't know (e.g. from a newer Scrybe), header -> value */
  extra: Record<string, string>
}

export interface ImportedBrand {
  name: string
  trybe_url: string | null
  trybe_brand_id: string | null
  pay_model: 'flat' | 'commission' | 'both' | null
  /** flat fee per video, in dollars */
  flat_fee: number | null
  /** % of GMV/sales */
  commission_pct: number | null
  currency: 'USD'
  trybe_score: number | null
  trybe_data: TrybeData
}

export interface ParsedImport {
  brands: ImportedBrand[]
  /** notes about the file, and rows that were left out */
  errors: string[]
}

// --- CSV -------------------------------------------------------------------

/** RFC 4180: quoted cells may hold commas, doubled quotes and line breaks. Accepts CRLF or LF and a BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  // drop blank lines
  return rows.filter(r => r.some(value => value.trim() !== ''))
}

// --- columns ---------------------------------------------------------------

/** Unit words that don't change what a column means: "Cap (USD)" is the cap. */
const UNIT_WORDS = new Set(['usd', 'gbp', 'eur', 'aud', 'cad', 'dollars', 'dollar', 'percent', 'percentage', 'pct', 'amount', 'value'])

/** "Commission %" -> "commission", "Cap (USD)" -> "cap": compare headers by their meaningful words only. */
export function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter(word => !UNIT_WORDS.has(word)).join(' ')
}

/**
 * The fields we read, each with every header name it has been exported under (v1, v2) plus
 * obvious variants. Matched with headerKey, so symbols and case don't matter.
 */
const FIELDS = {
  name: ['name', 'brand', 'brand name'],
  trybeLink: ['trybe link', 'link', 'trybe url', 'url'],
  trybeBrandId: ['trybe brand id', 'brand id', 'trybe id'],
  matched: ['matched', 'match'],
  matchNotes: ['match notes', 'match reasons'],
  payTypes: ['pay types', 'pay type', 'payment types', 'payment type'],
  commission: ['commission', 'commission rate', 'gmv', 'commission gmv'],
  adSpend: ['ad spend', 'ad spend rate'],
  /** several rates in one cell, e.g. "15% GMV + 5% ad spend" (v1) */
  rates: ['rate', 'rates'],
  flatPerVideo: ['flat per video', 'flat fee per video', 'per video'],
  flatPerOrder: ['flat per order', 'flat fee per order', 'per order'],
  retainer: ['retainer'],
  /** several flat fees in one cell, e.g. "$50/video" (v1) */
  flatFees: ['flat fee', 'flat fees'],
  cap: ['cap', 'commission cap'],
  payTerms: ['pay terms', 'terms'],
  trybeScore: ['trybe score', 'score'],
  rating: ['rating'],
  reviews: ['reviews', 'review count'],
  creatorEarnings: ['creator earnings', 'earnings'],
  totalCreators: ['total creators', 'creators'],
  categories: ['categories', 'category'],
  new: ['new', 'new brand'],
  samples: ['samples', 'free samples'],
  topProducts: ['top products', 'products'],
  about: ['about', 'description'],
  logo: ['logo', 'logo url'],
  scannedOn: ['scanned on', 'scanned', 'last scanned']
} satisfies Record<string, string[]>

type Field = keyof typeof FIELDS

/** Which column (if any) holds each field. The first header matching a field wins. */
function mapColumns(header: string[]) {
  const keys = header.map(headerKey)
  const columns = {} as Record<Field, number>
  const used = new Set<number>()
  for (const [field, names] of Object.entries(FIELDS) as [Field, string[]][]) {
    const at = names.map(name => keys.indexOf(name)).find(index => index !== -1 && !used.has(index)) ?? -1
    columns[field] = at
    if (at !== -1) used.add(at)
  }
  const unknown = keys.map((key, index) => ({ key, header: header[index]!.trim(), index })).filter(c => c.key && !used.has(c.index))
  return { columns, unknown }
}

// --- cell values -----------------------------------------------------------

/** Undo Scrybe's formula guard (a leading ' before = + - @ tab or CR). "unknown" / "n/a" are empty. */
function text(value: string | undefined): string | null {
  const raw = (value ?? '').replace(/^'(?=[=+\-@\t\r])/, '').trim()
  return raw === '' || /^(unknown|n\/?a|null|-|—)$/i.test(raw) ? null : raw
}

/** The first number in "$5,000/video", "15% GMV", "4.7": symbols and thousands commas are ignored. */
function number(value: string | undefined): number | null {
  const match = (text(value) ?? '').replace(/,(?=\d{3}\b)/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function list(value: string | undefined, separator: RegExp = /\s*[;•|]\s*/): string[] {
  return (text(value) ?? '').split(separator).map(item => item.trim()).filter(Boolean)
}

function yesNo(value: string | undefined): boolean | null {
  const raw = text(value)?.toLowerCase()
  if (raw && /^(yes|y|true|1)$/.test(raw)) return true
  if (raw && /^(no|n|false|0)$/.test(raw)) return false
  return null
}

function url(value: string | undefined): string | null {
  const raw = text(value)
  return raw && /^https?:\/\//i.test(raw) ? raw : null
}

/** YYYY-MM-DD from "2026-10-14", "2026-10-14T09:00:00Z" or any date the browser can read. */
function date(value: string | undefined): string | null {
  const raw = text(value)
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

/** A combined rates cell: "15% GMV", "5% ad spend", or several joined with + ; or | */
function splitRates(value: string | undefined) {
  let commission: number | null = null
  let adSpend: number | null = null
  for (const part of (text(value) ?? '').split(/[+;|]/)) {
    const amount = number(part)
    if (amount === null) continue
    if (/ad\s*spend/i.test(part)) adSpend ??= amount
    else commission ??= amount
  }
  return { commission, adSpend }
}

/** A combined flat-fee cell: "$50/video", "$10/order", "$500/month", or several joined with + ; or | */
function splitFlatFees(value: string | undefined) {
  const fees = { video: null as number | null, order: null as number | null, retainer: null as number | null }
  for (const part of (text(value) ?? '').split(/[+;|]/)) {
    const amount = number(part)
    if (amount === null) continue
    if (/order/i.test(part)) fees.order ??= amount
    else if (/month|retainer/i.test(part)) fees.retainer ??= amount
    else fees.video ??= amount
  }
  return fees
}

/** Trybe's brand ID, from its logo's address: …/brands/<uuid>/logos/… (also inside an encoded image URL). */
export function brandIdFromLogo(logo: string | null): string | null {
  if (!logo) return null
  let decoded = logo
  try {
    decoded = decodeURIComponent(logo)
  } catch {
    // keep the raw address
  }
  return decoded.match(/\/brands\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i)?.[1]?.toLowerCase() ?? null
}

// --- rows ------------------------------------------------------------------

/** Read a Scrybe export of any version into brands. Rows without a name are skipped and reported. */
export function parseScrybeCsv(csv: string): ParsedImport {
  const errors: string[] = []
  const rows = parseCsv(csv)
  if (!rows.length) return { brands: [], errors: ['The file is empty.'] }

  const header = rows[0]!
  const { columns, unknown } = mapColumns(header)
  if (columns.name === -1) {
    return { brands: [], errors: ['No brand name column (e.g. "name"). Is this a Scrybe brand export?'] }
  }

  const brands: ImportedBrand[] = []
  const seen = new Set<string>()
  const extraUsed = new Set<string>()

  rows.slice(1).forEach((cells, index) => {
    const get = (field: Field) => (columns[field] === -1 ? undefined : cells[columns[field]])
    const line = index + 2
    const name = text(get('name'))
    if (!name) {
      errors.push(`Row ${line} has no brand name, so it was skipped.`)
      return
    }
    const logo = url(get('logo'))
    const trybeBrandId = text(get('trybeBrandId')) ?? brandIdFromLogo(logo)
    const key = trybeBrandId ?? `name:${name.toLowerCase()}`
    if (seen.has(key)) {
      errors.push(`Row ${line} (${name}) is a duplicate of an earlier row, so it was skipped.`)
      return
    }
    seen.add(key)

    const rates = splitRates(get('rates'))
    const fees = splitFlatFees(get('flatFees'))
    const capCell = text(get('cap'))
    // `unknown` is a real value here (a filter needed a value Scrybe couldn't read), so read it raw
    const matched = (get('matched') ?? '').trim().toLowerCase()

    const extra: Record<string, string> = {}
    for (const column of unknown) {
      const value = text(cells[column.index])
      if (value !== null) {
        extra[column.header] = value
        extraUsed.add(column.header)
      }
    }

    const data: TrybeData = {
      source_columns: header.map(cell => cell.trim()),
      matched: matched === 'yes' || matched === 'no' || matched === 'unknown' ? matched : null,
      match_notes: list(get('matchNotes')),
      pay_types: list(get('payTypes'), /\s+\+\s+|\s*[;|]\s*/),
      commission_pct: number(get('commission')) ?? rates.commission,
      ad_spend_pct: number(get('adSpend')) ?? rates.adSpend,
      flat_per_video: number(get('flatPerVideo')) ?? fees.video,
      flat_per_order: number(get('flatPerOrder')) ?? fees.order,
      retainer: number(get('retainer')) ?? fees.retainer,
      cap: capCell && /^(none|no cap|uncapped)$/i.test(capCell) ? 'none' : number(get('cap')),
      pay_terms: list(get('payTerms'), /\s*\|\s*/),
      rating: number(get('rating')),
      reviews: number(get('reviews')),
      creator_earnings: text(get('creatorEarnings')),
      total_creators: number(get('totalCreators')),
      categories: list(get('categories')),
      new: yesNo(get('new')),
      samples: yesNo(get('samples')),
      top_products: list(get('topProducts'), /\s*[;|]\s*/),
      about: text(get('about')),
      logo,
      scanned_on: date(get('scannedOn')),
      extra
    }

    brands.push({
      name,
      trybe_url: url(get('trybeLink')),
      trybe_brand_id: trybeBrandId,
      pay_model: payModel(data),
      flat_fee: data.flat_per_video,
      commission_pct: data.commission_pct,
      currency: 'USD',
      trybe_score: number(get('trybeScore')),
      trybe_data: data
    })
  })

  if (extraUsed.size) errors.unshift(`Kept as extra Trybe data on each brand: ${[...extraUsed].join(', ')}.`)
  return { brands, errors }
}

/**
 * Our pay model from Scrybe's pay figures: any flat amount (per video, per order, retainer)
 * counts as flat; a commission or ad-spend percentage counts as commission.
 */
export function payModel(data: Pick<TrybeData, 'pay_types' | 'commission_pct' | 'ad_spend_pct' | 'flat_per_video' | 'flat_per_order' | 'retainer'>): ImportedBrand['pay_model'] {
  const types = data.pay_types.map(type => type.toLowerCase())
  const flat = data.flat_per_video !== null || data.flat_per_order !== null || data.retainer !== null
    || types.some(type => type.startsWith('flat') || type === 'retainer')
  const commission = data.commission_pct !== null || data.ad_spend_pct !== null
    || types.some(type => type.startsWith('%'))
  if (flat && commission) return 'both'
  if (flat) return 'flat'
  if (commission) return 'commission'
  return null
}

// --- plan ------------------------------------------------------------------

export interface ExistingBrand {
  id: string
  name: string
  slug: string
  trybe_brand_id: string | null
}

export interface ImportPlan {
  /** new prospects, with a slug that's free */
  creates: (ImportedBrand & { slug: string })[]
  /** brands already in Muttiplier: Trybe fields are refreshed, name/status/notes are kept */
  updates: { id: string, existingName: string, brand: ImportedBrand }[]
}

/** Match imported rows to existing brands, by Trybe brand ID first, then by name. */
export function planImport(brands: ImportedBrand[], existing: ExistingBrand[]): ImportPlan {
  const byTrybeId = new Map(existing.filter(b => b.trybe_brand_id).map(b => [b.trybe_brand_id!, b]))
  const byName = new Map(existing.map(b => [b.name.trim().toLowerCase(), b]))
  const takenSlugs = new Set(existing.map(b => b.slug))
  const plan: ImportPlan = { creates: [], updates: [] }

  for (const brand of brands) {
    const match = (brand.trybe_brand_id ? byTrybeId.get(brand.trybe_brand_id) : undefined)
      ?? byName.get(brand.name.trim().toLowerCase())
    if (match) {
      plan.updates.push({ id: match.id, existingName: match.name, brand })
      continue
    }
    const base = slugify(brand.name) || 'brand'
    let slug = base
    for (let n = 2; takenSlugs.has(slug); n++) slug = `${base}-${n}`
    takenSlugs.add(slug)
    plan.creates.push({ ...brand, slug })
  }
  return plan
}

/** Columns written for a new prospect. */
export function createFields(brand: ImportedBrand & { slug: string }) {
  return {
    name: brand.name,
    slug: brand.slug,
    status: 'prospect',
    trybe_url: brand.trybe_url,
    trybe_brand_id: brand.trybe_brand_id,
    pay_model: brand.pay_model,
    flat_fee: brand.flat_fee,
    commission_pct: brand.commission_pct,
    currency: brand.currency,
    trybe_score: brand.trybe_score,
    trybe_data: brand.trybe_data
  }
}

/** Columns refreshed on an existing brand. Values Scrybe couldn't read never blank out what's there. */
export function updateFields(brand: ImportedBrand) {
  const fields: Record<string, unknown> = { trybe_data: brand.trybe_data }
  if (brand.trybe_url) fields.trybe_url = brand.trybe_url
  if (brand.trybe_brand_id) fields.trybe_brand_id = brand.trybe_brand_id
  if (brand.trybe_score !== null) fields.trybe_score = brand.trybe_score
  if (brand.pay_model) {
    fields.pay_model = brand.pay_model
    fields.currency = brand.currency
    fields.flat_fee = brand.flat_fee
    fields.commission_pct = brand.commission_pct
  }
  return fields
}
