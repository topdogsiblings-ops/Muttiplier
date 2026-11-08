<script setup lang="ts">
import type { Row } from '#shared/types/models'

// Billing, in Settings → Profile (members see it at /billing): the org's Kreate subscription,
// and Klip. Admins subscribe (a 30-day free trial the first time) and manage it in Stripe's
// portal, and buy Klip once (a trial includes it until the trial ends); everyone else can see where
// things stand. Stripe tells the app through its webhook, so after checkout this waits for that to land.
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
  if (live.value) window.location.assign('/library')
  else toast.add({ title: 'Still waiting for Stripe', description: 'Your payment details went through. Refresh this page in a minute.', color: 'warning' })
})

// Sign Klip out everywhere (admins): licences issued before now aren't renewed
const { confirmDialog } = useConfirm()
const signingOutKlip = ref(false)
async function signOutKlip() {
  if (!(await confirmDialog({
    title: 'Sign Klip out everywhere?',
    description: `Everyone in ${currentOrg.value?.name ?? 'this organisation'} is signed out of Klip on every computer the next time it checks in (computers offline right now within 72 hours). Each one connects again with a new code from Kreate.`,
    confirmLabel: 'Sign out everywhere',
    danger: true
  }))) return
  signingOutKlip.value = true
  const { error } = await useSupabaseClient().rpc('sign_out_klip_everywhere')
  signingOutKlip.value = false
  toast.add(error
    ? { title: 'Couldn\'t sign Klip out', description: error.message, color: 'error' }
    : { title: 'Klip is signed out everywhere', description: 'Each computer connects again next time it\'s used.', color: 'success' })
}

// after buying Klip: the same wait, for the purchase
const klipOwned = computed(() => currentOrg.value?.klip_access === 'purchased')
const waitingKlip = ref(false)
onMounted(async () => {
  if (route.query.klip !== 'success' || klipOwned.value) return
  waitingKlip.value = true
  for (let i = 0; i < 15 && !klipOwned.value; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    await load()
  }
  waitingKlip.value = false
  if (klipOwned.value) toast.add({ title: 'Klip is yours', color: 'success' })
  else toast.add({ title: 'Still waiting for Stripe', description: 'Your payment went through. Refresh this page in a minute.', color: 'warning' })
})

const going = ref(false)
async function go(path: '/api/billing/checkout' | '/api/billing/portal' | '/api/billing/klip-checkout') {
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
  <div class="space-y-4">
    <UCard :ui="{ body: 'space-y-4' }">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="font-semibold text-highlighted">
          Kreate
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
          {{ currentOrg.name }} uses Kreate without a subscription.
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
    <UCard :ui="{ body: 'space-y-4' }">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="font-semibold text-highlighted">
          Klip
        </h2>
        <UBadge v-if="klipOwned" label="Owned" color="success" variant="subtle" />
        <UBadge v-else-if="currentOrg?.klip_access === 'exempt'" label="Included" color="success" variant="subtle" />
        <UBadge v-else-if="currentOrg?.klip_access === 'trial'" label="In your trial" color="info" variant="subtle" />
        <UBadge v-else label="Not bought" color="neutral" variant="subtle" />
      </div>

      <p v-if="waitingKlip" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Confirming your purchase with Stripe…
      </p>
      <p v-else class="text-sm text-muted">
        The desktop editor for your shoots' clips: trims, captions and treatments.
        <template v-if="klipOwned">
          {{ currentOrg?.name }} owns it, and can use it while Kreate is live.
        </template>
        <template v-else-if="currentOrg?.klip_access === 'exempt'">
          {{ currentOrg?.name }} uses it without buying it.
        </template>
        <template v-else-if="currentOrg?.klip_access === 'trial'">
          Your free trial includes it until {{ date(subscription?.trial_end) ?? 'the trial ends' }}. To keep it after that, buy it once for $189.99.
        </template>
        <template v-else>
          $189.99 once for your organisation, used alongside a Kreate subscription.
        </template>
      </p>

      <div v-if="isAdmin && !waitingKlip && !klipOwned && currentOrg?.klip_access !== 'exempt'">
        <UButton
          v-if="live"
          label="Buy Klip"
          icon="i-lucide-scissors"
          :loading="going"
          @click="go('/api/billing/klip-checkout')"
        />
        <p v-else class="text-sm text-muted">
          Start Kreate first: Klip works alongside it.
        </p>
      </div>

      <!-- like "sign out of all devices": every computer has to connect Klip again -->
      <div v-if="isAdmin" class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
        <p class="min-w-0 flex-1 text-sm text-muted">
          Sign everyone in {{ currentOrg?.name }} out of Klip on every computer. Each one connects again with a new code.
        </p>
        <UButton label="Sign Klip out everywhere" icon="i-lucide-log-out" color="neutral" variant="outline" :loading="signingOutKlip" @click="signOutKlip" />
      </div>
    </UCard>
    <p class="text-xs text-dimmed">
      Payments are handled by Stripe, which also handles sales tax and receipts.
    </p>
  </div>
</template>
