// Buy Top Dog Cut for the admin's org: a one-time payment through Stripe-hosted Checkout with
// Managed Payments, on the org's Stripe customer. It needs a live Kit (a trial counts, so a
// trialing org can keep Cut after the trial). The org has Cut once the webhook has recorded it.
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgAdmin(event)
  const config = useRuntimeConfig(event)
  const stripe = stripeClient(event)
  const db = serviceDb(event)
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  const [{ data: subscription }, { data: org }] = await Promise.all([
    db.from('org_subscriptions').select('stripe_customer_id, status').eq('org_id', orgId).maybeSingle(),
    db.from('orgs').select('billing_exempt, cut_purchased_at').eq('id', orgId).single()
  ])
  if (org?.cut_purchased_at || org?.billing_exempt) {
    throw createError({ statusCode: 409, statusMessage: 'This organisation already has Top Dog Cut.' })
  }
  if (!subscription || !isEntitled(subscription.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Top Dog Cut needs a Top Dog Kit subscription: start that first.' })
  }

  const prices = await stripe.prices.list({ lookup_keys: [config.stripeCutPriceLookupKey], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) throw createError({ statusCode: 503, statusMessage: `No active price with lookup key ${config.stripeCutPriceLookupKey}` })

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: subscription.stripe_customer_id,
    client_reference_id: orgId,
    line_items: [{ price: price.id, quantity: 1 }],
    managed_payments: { enabled: true },
    metadata: { org_id: orgId, purchase: 'cut' },
    payment_intent_data: { metadata: { org_id: orgId, purchase: 'cut' } },
    integration_identifier: 'top_dog_cut_purchase_hwqzrnfd',
    success_url: `${origin}/billing?cut=success`,
    cancel_url: `${origin}/billing`
  })
  return { url: session.url }
})
