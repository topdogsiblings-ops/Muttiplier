import { createHash, createPrivateKey, createPublicKey, randomBytes, randomInt, sign, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'

// Klip's license (Phase 5). Klip connects with a code (/api/license/device/*: a member
// approves it in Kreate, so Klip never signs in to Supabase), gets a token, and checks it offline with
// the public key (Ed25519), so no secret lives in the app. It refreshes with /api/license/refresh
// while online; a token lasts 72 hours offline, or until a trial's end when Klip comes from the
// trial. Using Klip needs both subscriptionState 'active' and klipPurchased.
//
// A token is `<payload>.<signature>`, both base64url; the payload is the JSON below.

export type KlipAccess = 'purchased' | 'trial' | 'exempt' | 'none'
const KLIP_ACCESS: KlipAccess[] = ['purchased', 'trial', 'exempt', 'none']

export interface License {
  v: 1
  orgId: string
  userId: string
  /** the org's Kreate: trialing, active and past due (Stripe still retrying) and billing-exempt are all 'active' */
  subscriptionState: 'active' | 'lapsed'
  /** the org has Klip: bought, billing-exempt or trialing */
  klipPurchased: boolean
  /** how it has Klip, for showing only */
  klipAccess: KlipAccess
  /** @deprecated the same as klipPurchased, for Klip builds from before the rename; goes once Klip reads klipPurchased */
  cutPurchased: boolean
  /** @deprecated the same as klipAccess; goes with cutPurchased */
  cutAccess: KlipAccess
  /** when the trial ends (ms since epoch), while trialing */
  trialEndsAt: number | null
  issuedAt: number
  expiresAt: number
}

const OFFLINE_GRACE = 72 * 60 * 60 * 1000
/** how long after it was issued a token can still be traded in at /refresh; past this, sign in again */
const REFRESH_WINDOW = 30 * 24 * 60 * 60 * 1000

function signingKey(event: H3Event): KeyObject {
  const der = useRuntimeConfig(event).licensePrivateKey
  if (!der) throw createError({ statusCode: 503, statusMessage: 'Licensing isn\'t configured. Set LICENSE_PRIVATE_KEY.' })
  return createPrivateKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'pkcs8' })
}

/** The public key Klip checks tokens with (SPKI DER, base64). */
export const licensePublicKey = (event: H3Event) =>
  createPublicKey(signingKey(event)).export({ format: 'der', type: 'spki' }).toString('base64')

/** The org's license for this user, signed. */
export async function issueLicense(event: H3Event, orgId: string, userId: string) {
  const { data, error } = await serviceDb(event).rpc('org_license_state', { p_org_id: orgId })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const state = data?.[0]
  if (!state) throw createError({ statusCode: 404, statusMessage: 'No such organisation' })

  const issuedAt = Date.now()
  // anything unexpected locks Klip rather than opening it
  const klipAccess: KlipAccess = KLIP_ACCESS.includes(state.klip_access as KlipAccess) ? state.klip_access as KlipAccess : 'none'
  const trialEndsAt = state.trial_end ? new Date(state.trial_end).getTime() : null
  let expiresAt = issuedAt + OFFLINE_GRACE
  // Klip from the trial ends with the trial, offline or not
  if (klipAccess === 'trial' && trialEndsAt) expiresAt = Math.min(expiresAt, trialEndsAt)

  const license: License = {
    v: 1,
    orgId,
    userId,
    subscriptionState: state.entitled ? 'active' : 'lapsed',
    klipPurchased: klipAccess !== 'none',
    klipAccess,
    cutPurchased: klipAccess !== 'none',
    cutAccess: klipAccess,
    trialEndsAt,
    issuedAt,
    expiresAt
  }
  const payload = Buffer.from(JSON.stringify(license)).toString('base64url')
  const signature = sign(null, Buffer.from(payload), signingKey(event)).toString('base64url')
  return { token: `${payload}.${signature}`, license }
}

/** A token this server signed, expired or not (null if it isn't one). */
export function readLicense(event: H3Event, token: string): License | null {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra !== undefined) return null
  const key = createPublicKey(signingKey(event))
  if (!verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url'))) return null
  try {
    const license = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as License
    return license.v === 1 ? license : null
  } catch {
    return null
  }
}

export const refreshable = (license: License) => Date.now() - license.issuedAt <= REFRESH_WINDOW

/** Who's asking: the member signed in to Kreate. */
export async function licenseUser(event: H3Event) {
  const claims = await serverSupabaseUser(event).catch(() => null)
  if (claims?.sub) return claims.sub
  throw createError({ statusCode: 401, statusMessage: 'Sign in first' })
}

/**
 * The org the license is for: the one asked for, else the user's current org, else their only
 * one. They must be a member of it.
 */
export async function licenseOrg(event: H3Event, userId: string, asked?: string | null) {
  const db = serviceDb(event)
  const { data: memberships } = await db.from('org_members').select('org_id').eq('user_id', userId)
  const orgIds = (memberships ?? []).map(row => row.org_id)
  if (asked) {
    if (!orgIds.includes(asked)) throw createError({ statusCode: 403, statusMessage: 'You\'re not in that organisation' })
    return asked
  }
  const { data: profile } = await db.from('profiles').select('active_org_id').eq('id', userId).maybeSingle()
  if (profile?.active_org_id && orgIds.includes(profile.active_org_id)) return profile.active_org_id
  if (orgIds.length === 1) return orgIds[0]!
  throw createError({ statusCode: orgIds.length ? 409 : 403, statusMessage: orgIds.length ? 'Choose an organisation' : 'You\'re not in an organisation' })
}

// --- connecting Klip with a code --------------------------------------------------------------

/** How long a code lasts, and how often Klip may check back. */
export const DEVICE_CODE_SECONDS = 10 * 60
export const DEVICE_POLL_SECONDS = 5
// no 0/O, 1/I/L, 5/S, 8/B, 2/Z: easy to read back
const USER_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'

export const hashDeviceCode = (code: string) => createHash('sha256').update(code).digest('hex')

/** 8 characters, about 2^37 of them: with codes lasting 10 minutes and approval needing a signed-in member, not guessable. */
export function newUserCode() {
  return Array.from({ length: 8 }, () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]).join('')
}

export const newDeviceCode = () => randomBytes(32).toString('base64url')

/** What someone typed ("kq7x-m2pd ") as it's stored ("KQ7XM2PD"). */
export const normaliseUserCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** "KQ7XM2PD" -> "KQ7X-M2PD" */
export const formatUserCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`
