<script setup lang="ts">
import type { Row } from '#shared/types/models'

// Billing: the org's Top Dog Kit subscription. Admins subscribe (a 30-day free trial the first
// time) and manage it in Stripe's portal; everyone else can see whether it's live. Stripe tells
// the app through its webhook, so after checkout this page waits for that to land.
const db = useDb()
const route = useRoute()
const toast = useToast()
const { isAdmin } = useAccess()
const { currentOrg, load } = useOrg()

const subscription = ref<Row<'org_subscriptions'> | null>(null)
async function refresh() {
  const { data } = await db.from('org_subscriptions').select('*').maybeSingle()
  subscription.value = data
  await load()
}
await refresh()

const STATUS: Record<string, { label: string, color: 'success' | 'warning' | 'error' | 'neutral' | 'info' }> = {
  trialing: { label: 'Free trial', color: 'info' },
  active: { label: 'Active', color: 'success' },
  past_due: { label: 'Payment failed: retrying', color: 'warning' },
  canceled: { label: 'Cancelled', color: 'neutral' },
  unpaid: { label: 'Unpaid', color: 'error' },
  incomplete: { label: 'Waiting for payment', color: 'warning' },
  incomplete_expired: { label: 'Checkout expired', color: 'neutral' },
  paused: { label: 'Paused', color: 'neutral' }
}
const live = computed(() => ['trialing', 'active', 'past_due'].includes(subscription.value?.status ?? ''))
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : null

// after checkout: wait for the webhook to sync the subscription (it usually beats the redirect, but not always)
const waiting = ref(false)
onMounted(async () => {
  if (route.query.checkout !== 'success' || live.value) return
  waiting.value = true
  for (let i = 0; i < 15 && !live.value; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    await refresh()
  }
  waiting.value = false
  if (live.value) window.location.assign('/shoots')
  else toast.add({ title: 'Still waiting for Stripe', description: 'Your payment details went through. Refresh this page in a minute.', color: 'warning' })
})

const going = ref(false)
async function go(path: '/api/billing/checkout' | '/api/billing/portal') {
  going.value = true
  try {
    const { url } = await $fetch<{ url: string | null }>(path, { method: 'POST' })
    if (url) window.location.assign(url)
  } catch (error) {
    toast.add({ title: 'Couldn\'t open Stripe', description: (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? (error as Error).message, color: 'error' })
    going.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="billing">
    <template #header>
      <UDashboardNavbar title="Billing" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-xl space-y-4">
        <UCard :ui="{ body: 'space-y-4' }">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-semibold text-highlighted">
              Top Dog Kit
            </h2>
            <UBadge v-if="currentOrg?.entitled && !subscription?.status" label="Included" color="success" variant="subtle" />
            <UBadge v-else-if="subscription?.status" :label="STATUS[subscription.status]?.label ?? subscription.status" :color="STATUS[subscription.status]?.color ?? 'neutral'" variant="subtle" />
            <UBadge v-else label="Not subscribed" color="neutral" variant="subtle" />
          </div>

          <p v-if="waiting" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            Confirming your subscription with Stripe…
          </p>
          <template v-else-if="currentOrg?.entitled && !subscription?.status">
            <p class="text-sm text-muted">
              {{ currentOrg.name }} uses Top Dog Kit without a subscription.
            </p>
          </template>
          <template v-else-if="live">
            <p class="text-sm text-muted">
              <template v-if="subscription?.status === 'trialing'">
                Your free trial ends {{ date(subscription.trial_end) }}, when the first payment of $54.99 is taken.
              </template>
              <template v-else-if="subscription?.cancel_at_period_end">
                Cancelled: it stays live until {{ date(subscription.current_period_end) }}.
              </template>
              <template v-else>
                $54.99 a month, renewing {{ date(subscription?.current_period_end) }}. Your whole team is included.
              </template>
            </p>
          </template>
          <p v-else class="text-sm text-muted">
            $54.99 a month for your organisation, with your whole team included.
            <template v-if="!subscription?.trial_used">
              Start with a 30-day free trial: you won't be charged until it ends, and you can cancel any time before.
            </template>
          </p>

          <div v-if="isAdmin && !waiting" class="flex flex-wrap gap-2">
            <UButton
              v-if="!live && !(currentOrg?.entitled && !subscription?.status)"
              :label="subscription?.trial_used ? 'Subscribe' : 'Start free trial'"
              icon="i-lucide-credit-card"
              :loading="going"
              @click="go('/api/billing/checkout')"
            />
            <UButton
              v-if="subscription"
              label="Manage billing"
              icon="i-lucide-external-link"
              color="neutral"
              variant="subtle"
              :loading="going"
              @click="go('/api/billing/portal')"
            />
          </div>
          <p v-else-if="!isAdmin && !currentOrg?.entitled" class="text-sm text-muted">
            Ask an admin of {{ currentOrg?.name }} to start the subscription.
          </p>
        </UCard>
        <p class="text-xs text-dimmed">
          Payments are handled by Stripe, which also handles sales tax and receipts.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
