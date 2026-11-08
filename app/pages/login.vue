<script setup lang="ts">
// Sign in (Google, or an email and password), or create an account: the plans first, then the
// chosen plan's sign-up in a modal. The plans are a pricing preview (docs/spec.md §15): nothing is
// charged here, and the plan picked is only noted on the account. An invite email's link
// (?invite=<email>&org=<name>) opens on joining instead: no plans (members don't pay), the email filled in.
definePageMeta({ layout: 'plain' })

const route = useRoute()

const invitedEmail = typeof route.query.invite === 'string' ? route.query.invite : ''
const invitedOrg = typeof route.query.org === 'string' ? route.query.org : ''
/** joining from an invite: create the account (or sign in, if they have one) */
const joining = ref<'sign-up' | 'sign-in'>('sign-up')

// ?reset=1 (the password-changed email's button) opens on resetting a password
const view = ref<'sign-in' | 'reset' | 'plans' | 'invite'>(invitedEmail ? 'invite' : route.query.reset ? 'reset' : 'sign-in')
function switchTo(next: 'sign-in' | 'sign-up' | 'reset') {
  if (view.value === 'invite' && next !== 'reset') joining.value = next
  else view.value = next === 'sign-up' ? 'plans' : next
}

const PLANS = [
  {
    title: 'Starter',
    description: 'For getting started with a few brands.',
    price: '$44.99',
    features: ['Up to 5 brands', '2 seats', '2 shoots a month', 'Insights and diversity settings', 'Basic treatments', 'Klip available to buy']
  },
  {
    title: 'Pro',
    description: 'For creators and teams shooting every week.',
    price: '$74.99',
    badge: 'Most popular',
    highlight: true,
    scale: true,
    features: ['Up to 10 brands', 'Unlimited seats', '6 shoots a month', 'Connect your AI', 'Insights and diversity settings', 'Moderate treatments', 'Klip available to buy']
  },
  {
    title: 'Studio',
    description: 'For running many brands at once.',
    price: '$149.99',
    features: ['Unlimited brands', 'Unlimited seats', 'Unlimited shoots', 'Connect your AI', 'Insights and diversity settings', 'Advanced treatments', 'Klip included']
  }
]

const signUpOpen = ref(false)
const plan = ref<string>()
const plans = computed(() => PLANS.map(({ title, ...rest }) => ({
  title,
  ...rest,
  billingCycle: '/month',
  terms: '30-day free trial',
  button: {
    label: 'Start free trial',
    color: rest.highlight ? 'primary' as const : 'neutral' as const,
    variant: rest.highlight ? 'solid' as const : 'subtle' as const,
    onClick: () => {
      plan.value = title
      signUpOpen.value = true
    }
  }
})))
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <!-- the plans, before creating an account -->
    <div v-if="view === 'plans'" class="w-full max-w-5xl space-y-8 py-8">
      <div class="flex flex-col items-center gap-3 text-center">
        <AppLogo class="size-12 text-highlighted" />
        <h1 class="flex items-baseline justify-center gap-1.5 text-highlighted">
          <span class="text-xl font-semibold">Kreate</span>
          <span class="text-xs font-light text-muted">by UGC Kompany</span>
        </h1>
        <div class="pb-5">
          <h2 class="text-2xl font-semibold text-highlighted">
            Choose your plan
          </h2>
          <p class="text-sm text-muted">
            One subscription per organisation. Start with a 30-day free trial and cancel any time.
          </p>
        </div>
      </div>

      <UPricingPlans :plans="plans" scale />

      <p class="text-center text-sm text-muted">
        Already have an account?
        <button type="button" class="font-medium text-highlighted hover:underline" @click="switchTo('sign-in')">
          Sign in
        </button>
      </p>
    </div>

    <!-- signing in, or asking for a password reset -->
    <UCard v-else class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-4 text-center">
        <AppLogo class="mx-auto size-12 text-highlighted" />
        <h1 class="flex items-baseline justify-center gap-1.5 text-highlighted">
          <span class="text-xl font-semibold">Kreate</span>
          <span class="text-xs font-light text-muted">by UGC Kompany</span>
        </h1>

        <UAlert
          v-if="route.query.expired"
          color="neutral"
          variant="subtle"
          icon="i-lucide-clock"
          title="Please sign in again"
          description="You were signed out, perhaps from another device."
          class="text-left"
        />
        <UAlert
          v-if="route.query.denied"
          color="error"
          variant="subtle"
          icon="i-lucide-shield-x"
          title="No access"
          description="That account isn't in an organisation. Ask an admin to invite your email, then sign in again."
          class="text-left"
        />

        <!-- joining from an invite email -->
        <template v-if="view === 'invite'">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Join {{ invitedOrg || 'your team' }}
            </h2>
            <p class="text-sm text-muted">
              {{ joining === 'sign-up' ? 'Create your account' : 'Sign in' }} with {{ invitedEmail }} and you're in. Joining is free.
            </p>
          </div>
          <AuthForm :key="joining" :mode="joining" :email="invitedEmail" @switch="switchTo" />
        </template>
        <AuthForm v-else :mode="view === 'reset' ? 'reset' : 'sign-in'" @switch="switchTo" />

        <p class="text-sm text-muted">
          <template v-if="view === 'invite'">
            {{ joining === 'sign-up' ? 'Already have an account?' : 'New to Kreate?' }}
            <button type="button" class="font-medium text-highlighted hover:underline" @click="joining = joining === 'sign-up' ? 'sign-in' : 'sign-up'">
              {{ joining === 'sign-up' ? 'Sign in' : 'Create an account' }}
            </button>
          </template>
          <template v-else-if="view === 'sign-in'">
            New here?
            <button type="button" class="font-medium text-highlighted hover:underline" @click="switchTo('sign-up')">
              Create an account
            </button>
          </template>
          <button v-else type="button" class="font-medium text-highlighted hover:underline" @click="switchTo('sign-in')">
            Back to sign in
          </button>
        </p>
      </div>
    </UCard>

    <UModal v-model:open="signUpOpen" :title="`Start your ${plan} trial`" description="Create your account. You'll set up your organisation next.">
      <template #body>
        <AuthForm mode="sign-up" :plan="plan" @switch="switchTo" />
      </template>
    </UModal>
  </div>
</template>
