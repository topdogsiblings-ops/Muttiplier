// Buy Klip for the admin's org: a one-time payment through Stripe-hosted Checkout with
// Managed Payments, on the org's Stripe customer. It needs a live Kreate (a trial counts, so a
// trialing org can keep Klip after the trial). The org has Klip once the webhook has recorded it.
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgAdmin(event)
  const config = useRuntimeConfig(event)
  const stripe = stripeClient(event)
  const db = serviceDb(event)
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin

  const [{ data: subscription }, { data: org }] = await Promise.all([
    db.from('org_subscriptions').select('stripe_customer_id, status').eq('org_id', orgId).maybeSingle(),
    db.from('orgs').select('billing_exempt, klip_purchased_at').eq('id', orgId).single()
  ])
  if (org?.klip_purchased_at || org?.billing_exempt) {
    throw createError({ statusCode: 409, statusMessage: 'This organisation already has Klip.' })
  }
  if (!subscription || !isEntitled(subscription.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Klip needs a Kreate subscription: start that first.' })
  }

  const prices = await stripe.prices.list({ lookup_keys: [config.stripeKlipPriceLookupKey], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) throw createError({ statusCode: 503, statusMessage: `No active price with lookup key ${config.stripeKlipPriceLookupKey}` })

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: subscription.stripe_customer_id,
    client_reference_id: orgId,
    line_items: [{ price: price.id, quantity: 1 }],
    managed_payments: { enabled: true },
    metadata: { org_id: orgId, purchase: 'klip' },
    payment_intent_data: { metadata: { org_id: orgId, purchase: 'klip' } },
    integration_identifier: 'ugc_klip_purchase_hwqzrnfd',
    success_url: `${origin}/settings?tab=profile&klip=success`,
    cancel_url: `${origin}/settings?tab=profile`
  })
  return { url: session.url }
})
