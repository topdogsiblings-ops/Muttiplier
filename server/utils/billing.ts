import Stripe from 'stripe'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Billing (Phase 4): one Top Dog Kit subscription per org, through Stripe Checkout with Managed
// Payments (Stripe is the merchant of record: tax, fraud, disputes). Stripe is the source of truth:
// every webhook re-reads the subscription from Stripe, so events arriving out of order can't leave
// org_subscriptions stale. Only the server writes billing rows, with the service role.

export function stripeClient(event: H3Event) {
  const key = useRuntimeConfig(event).stripeSecretKey
  if (!key) throw createError({ statusCode: 503, statusMessage: 'Billing isn\'t configured. Set STRIPE_SECRET_KEY.' })
  return new Stripe(key)
}

/** The service-role client: bypasses row level security, so it's only for billing writes and usage logging. */
export const serviceDb = (event: H3Event) => serverSupabaseServiceRole<Database>(event)

const ENTITLED = ['trialing', 'active', 'past_due']
export const isEntitled = (status: string | null | undefined) => !!status && ENTITLED.includes(status)

/** The org a Stripe subscription belongs to: its metadata, else the org that owns its customer. */
async function orgOf(db: ReturnType<typeof serviceDb>, subscription: Stripe.Subscription) {
  if (subscription.metadata?.org_id) return subscription.metadata.org_id
  const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const { data } = await db.from('org_subscriptions').select('org_id').eq('stripe_customer_id', customer).maybeSingle()
  return data?.org_id ?? null
}

/** Copy a subscription's current state from Stripe into org_subscriptions. */
export async function syncSubscription(event: H3Event, subscriptionId: string) {
  const stripe = stripeClient(event)
  const db = serviceDb(event)
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const orgId = await orgOf(db, subscription)
  if (!orgId) throw new Error(`No org for subscription ${subscriptionId}`)
  const item = subscription.items.data[0]
  const seconds = (value: number | null | undefined) => value ? new Date(value * 1000).toISOString() : null
  const { error } = await db.from('org_subscriptions').upsert({
    org_id: orgId,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    price_id: item?.price.id ?? null,
    current_period_end: seconds(item?.current_period_end),
    trial_end: seconds(subscription.trial_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    ...(subscription.trial_end ? { trial_used: true } : {}),
    synced_at: new Date().toISOString()
  }, { onConflict: 'org_id' })
  if (error) throw error
}

/** Add one AI request's token use to the org's monthly total (best effort: never fails the request). */
export async function recordAiUsage(event: H3Event, orgId: string, usage: { input_tokens?: number | null, output_tokens?: number | null, cache_read_input_tokens?: number | null, cache_creation_input_tokens?: number | null } | null | undefined) {
  if (!usage) return
  try {
    await serviceDb(event).rpc('record_ai_usage', {
      p_org_id: orgId,
      p_input: usage.input_tokens ?? 0,
      p_output: usage.output_tokens ?? 0,
      p_cache_read: usage.cache_read_input_tokens ?? 0,
      p_cache_write: usage.cache_creation_input_tokens ?? 0
    })
  } catch (error) {
    console.error('Couldn\'t record AI usage', error)
  }
}

/** The signed-in admin's org, for starting checkout or opening the portal. */
export async function requireOrgAdmin(event: H3Event) {
  const access = await requireMember(event)
  if (!access.admin) throw createError({ statusCode: 403, statusMessage: 'Only an admin can manage billing' })
  return access
}
