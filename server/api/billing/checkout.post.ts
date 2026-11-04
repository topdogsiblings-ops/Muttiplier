import { serverSupabaseUser } from '#supabase/server'

// Start a UGC Kit subscription for the admin's org: Stripe-hosted Checkout with Managed Payments,
// a 30-day trial the first time (card on file), and the org on the subscription's metadata so the
// webhook knows whose it is. The org is entitled only once the webhook has synced it.
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgAdmin(event)
  const config = useRuntimeConfig(event)
  const stripe = stripeClient(event)
  const db = serviceDb(event)
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  const [{ data: existing }, { data: org }] = await Promise.all([
    db.from('org_subscriptions').select('*').eq('org_id', orgId).maybeSingle(),
    db.from('orgs').select('name').eq('id', orgId).single()
  ])
  if (isEntitled(existing?.status)) {
    throw createError({ statusCode: 409, statusMessage: 'This organisation already has a subscription: use Manage billing instead.' })
  }

  // one Stripe customer per org, reused for every checkout
  let customer = existing?.stripe_customer_id
  if (!customer) {
    const user = await serverSupabaseUser(event)
    const created = await stripe.customers.create(
      { name: org?.name, email: user?.email, metadata: { org_id: orgId } },
      { idempotencyKey: `org-customer-${orgId}` }
    )
    customer = created.id
    const { error } = await db.from('org_subscriptions').insert({ org_id: orgId, stripe_customer_id: customer })
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const prices = await stripe.prices.list({ lookup_keys: [config.stripePriceLookupKey], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) throw createError({ statusCode: 503, statusMessage: `No active price with lookup key ${config.stripePriceLookupKey}` })

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: orgId,
    line_items: [{ price: price.id, quantity: 1 }],
    managed_payments: { enabled: true },
    subscription_data: {
      metadata: { org_id: orgId },
      // one free trial per org
      ...(existing?.trial_used ? {} : { trial_period_days: 30 })
    },
    integration_identifier: 'top_dog_kit_subscribe_qmrtvwkz',
    success_url: `${origin}/settings?tab=profile&checkout=success`,
    cancel_url: `${origin}/settings?tab=profile`
  })
  return { url: session.url }
})
