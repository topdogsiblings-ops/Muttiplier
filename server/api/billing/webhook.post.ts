import type Stripe from 'stripe'

// Stripe's webhook (Dashboard > Developers > Webhooks: <origin>/api/billing/webhook). Verified by
// signature; every subscription event re-reads the subscription from Stripe, so it doesn't matter
// what order events arrive in. UGC Klip purchases come through checkout.session.* (re-read the
// same way) and full refunds through charge.refunded. An error answers 500 so Stripe retries.
export default defineEventHandler(async (event) => {
  const secret = useRuntimeConfig(event).stripeWebhookSecret
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'Set STRIPE_WEBHOOK_SECRET' })
  const body = await readRawBody(event, false)
  const signature = getHeader(event, 'stripe-signature')
  if (!body || !signature) throw createError({ statusCode: 400, statusMessage: 'Not a Stripe event' })

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripeClient(event).webhooks.constructEvent(body, signature, secret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Bad signature' })
  }

  try {
    const subscriptionId = subscriptionOf(stripeEvent)
    if (subscriptionId) await syncSubscription(event, subscriptionId)
    else if (isKlipCheckout(stripeEvent)) await syncKlipPurchase(event, stripeEvent.data.object.id)
    else if (stripeEvent.type === 'charge.refunded') await refundKlipPurchase(event, stripeEvent.data.object)
  } catch (error) {
    console.error(`Stripe ${stripeEvent.type} ${stripeEvent.id}:`, error)
    throw createError({ statusCode: 500, statusMessage: 'Couldn\'t sync billing' })
  }
  return { received: true }
})

/** A finished checkout for UGC Klip (a one-time payment, not a subscription). */
function isKlipCheckout(stripeEvent: Stripe.Event): stripeEvent is Stripe.CheckoutSessionCompletedEvent | Stripe.CheckoutSessionAsyncPaymentSucceededEvent {
  return (stripeEvent.type === 'checkout.session.completed' || stripeEvent.type === 'checkout.session.async_payment_succeeded')
    && stripeEvent.data.object.mode === 'payment' && stripeEvent.data.object.metadata?.purchase === 'klip'
}

const id = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id ?? null

/** The subscription an event is about, for the events that change one. */
function subscriptionOf(stripeEvent: Stripe.Event): string | null {
  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return id(stripeEvent.data.object.subscription)
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
    case 'customer.subscription.trial_will_end':
      return stripeEvent.data.object.id
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return id(stripeEvent.data.object.parent?.subscription_details?.subscription)
    default:
      return null
  }
}
