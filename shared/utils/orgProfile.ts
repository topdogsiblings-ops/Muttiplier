// What an org tells the app about itself (Settings → Scripts): the profile asked for when the org
// is started, the AI preamble written from it, and its channel slots.
import { BUILT_IN_SLOTS } from './slots'

export interface OrgProfile {
  /** what the org is, e.g. "a UGC agency making ads for pet brands" */
  about: string
  /** what the ads sell, e.g. "dog food, treats and supplements" */
  products: string
  /** who films them, e.g. "creators filming at home with their own dogs" */
  creators: string
  /** who they're for, e.g. "dog parents" */
  audience: string
  /** how scripts should sound (optional) */
  voice: string
  /** spelling to write in, e.g. "Australian English" (optional) */
  language: string
}

export const EMPTY_PROFILE: OrgProfile = { about: '', products: '', creators: '', audience: '', voice: '', language: '' }

/**
 * The ad categories an org picks from ("What are your ad categories?"): every category on brands'
 * Trybe data so far, and the usual UGC ones. The picks are saved as `products`, as a list in words.
 */
export const AD_CATEGORIES = [
  'Beauty & Skincare', 'Haircare', 'Makeup & Cosmetics', 'Fragrance',
  'Fashion & Apparel', 'Jewellery & Accessories',
  'Health & Wellness', 'Supplements & Nutrition', 'Fitness & Sports', 'Recovery & Massage', 'Sleep',
  'Food & Beverage', 'Home & Kitchen', 'Home Decor', 'Cleaning & Household',
  'Baby & Kids',
  'Pets', 'Pet Supplies', 'Pet Food & Treats', 'Pet Accessories', 'Pet Grooming', 'Pet Toys',
  'Tech & Gadgets', 'SaaS & Tools', 'Apps & Games', 'Finance',
  'Travel', 'Outdoors & Camping', 'Automotive',
  'Arts & Crafts', 'Books & Education', 'Gift Sets', 'Holiday Products', 'Party Supplies',
  'Sustainability'
] as const

/** Categories as words: "Pets, Pet Toys and Gift Sets". */
export function categoriesToText(categories: string[]): string {
  const list = categories.map(category => category.trim()).filter(Boolean)
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? ''
}

/** Back from words to categories (also reads older free text, e.g. "dog food, treats and toys"). */
export function textToCategories(text: string): string[] {
  return text.split(/,\s*|\s+and\s+/).map(part => part.trim()).filter(Boolean)
}

export const LANGUAGES =['Australian English', 'British English', 'American English', 'Canadian English', 'New Zealand English']

/** Read `settings.org_profile` defensively. */
export function parseOrgProfile(value: unknown): OrgProfile {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.keys(EMPTY_PROFILE).map(key => [key, typeof source[key] === 'string' ? (source[key] as string).trim() : ''])) as unknown as OrgProfile
}

/** The recommended AI preamble: who the org is, from its profile. Lines with nothing to say are left out. */
export function recommendedPreamble(orgName: string, profile: OrgProfile): string {
  const name = orgName.trim() || 'the organisation'
  const ads = [
    profile.products && `The ads are for ${profile.products}`,
    profile.creators && `filmed by ${profile.creators}`,
    profile.audience && `and speak to ${profile.audience}`
  ].filter(Boolean).join(', ')
  return [
    `You write short-form UGC ad scripts for ${name}${profile.about ? `, ${profile.about}` : ''}.`,
    ads ? `${ads}.` : '',
    `Write the way the creator would really talk to camera${profile.voice ? `: ${profile.voice}` : ''}.`,
    profile.language ? `Use ${profile.language} spelling and phrasing.` : ''
  ].filter(Boolean).join(' ')
}

/** The preamble its connected AI is given: the org's own, or the recommended one. */
export const aiPreamble = (orgName: string, settings: { ai_preamble?: string | null, org_profile?: unknown } | null | undefined) =>
  settings?.ai_preamble?.trim() || recommendedPreamble(orgName, parseOrgProfile(settings?.org_profile))

export interface ChannelSlot {
  /** the slot's name: {{name}} */
  name: string
  /** what it is, e.g. "How the channel's pet is said in a script" */
  description: string
  /** an example value, e.g. "my Doberman" */
  example: string
}

/** Read `settings.channel_slots` defensively: lowercased names, no duplicates or built-ins. */
export function parseChannelSlots(value: unknown): ChannelSlot[] {
  if (!Array.isArray(value)) return []
  const slots: ChannelSlot[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const name = String(record.name ?? '').trim().toLowerCase()
    if (!/^[a-z0-9_]+$/.test(name) || (BUILT_IN_SLOTS as readonly string[]).includes(name) || slots.some(slot => slot.name === name)) continue
    slots.push({ name, description: String(record.description ?? '').trim(), example: String(record.example ?? '').trim() })
  }
  return slots
}

/** Read `channels.slot_values` defensively. */
export function parseSlotValues(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => typeof entry === 'string')
    .map(([key, entry]) => [key.toLowerCase(), (entry as string).trim()]))
}
