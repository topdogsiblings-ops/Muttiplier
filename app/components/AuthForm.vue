<script setup lang="ts">
// Google, or an email and password: signing in, creating an account, or asking for a password
// reset link. A new email account confirms its address by the link Supabase emails before it can
// join an organisation (that's what proves the email is theirs).
const props = defineProps<{
  mode: 'sign-in' | 'sign-up' | 'reset'
  /** sign-up: the plan they picked (pricing preview: noted on the account, nothing is charged) */
  plan?: string
  /** the email to start with (an invite link fills it in) */
  email?: string
}>()
const emit = defineEmits<{ switch: [mode: 'sign-in' | 'sign-up' | 'reset'] }>()

const supabase = useSupabaseClient()
const toast = useToast()

const email = ref(props.email ?? '')
const password = ref('')
const loading = ref(false)
const googleLoading = ref(false)
/** what to tell them once an email has gone out */
const sent = ref<'confirm' | 'reset' | null>(null)
const error = ref('')
watch(() => props.mode, () => {
  error.value = ''
  sent.value = null
})

const origin = () => window.location.origin
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))
const ready = computed(() => emailOk.value && (props.mode === 'reset' || password.value.length >= (props.mode === 'sign-up' ? 8 : 1)))

async function google() {
  googleLoading.value = true
  const { error: failure } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin()}/confirm` }
  })
  if (failure) {
    googleLoading.value = false
    toast.add({ title: 'Sign-in failed', description: failure.message, color: 'error' })
  }
}

async function submit() {
  loading.value = true
  error.value = ''
  const address = email.value.trim()
  if (props.mode === 'sign-in') {
    const { error: failure } = await supabase.auth.signInWithPassword({ email: address, password: password.value })
    if (failure) error.value = /confirm/i.test(failure.message) ? 'Confirm your email first: open the link we sent you.' : 'That email and password don\'t match.'
    else await navigateTo('/confirm')
  } else if (props.mode === 'sign-up') {
    const { data, error: failure } = await supabase.auth.signUp({
      email: address,
      password: password.value,
      options: { emailRedirectTo: `${origin()}/confirm`, ...(props.plan ? { data: { plan: props.plan } } : {}) }
    })
    if (failure) error.value = failure.message
    else if (data.session) await navigateTo('/confirm')
    else sent.value = 'confirm'
  } else {
    const { error: failure } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${origin()}/reset-password` })
    if (failure) error.value = failure.message
    else sent.value = 'reset'
  }
  loading.value = false
}

async function resend() {
  const { error: failure } = await supabase.auth.resend({ type: 'signup', email: email.value.trim(), options: { emailRedirectTo: `${origin()}/confirm` } })
  toast.add(failure ? { title: 'Couldn\'t resend it', description: failure.message, color: 'error' } : { title: 'Sent again', color: 'success' })
}
</script>

<template>
  <div class="flex w-full flex-col items-center gap-4 text-center">
    <template v-if="sent">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        title="Check your email"
        :description="sent === 'confirm'
          ? `We've sent a link to ${email.trim()}. Open it to confirm your address and finish signing up.`
          : `If ${email.trim()} has an account, we've sent it a link to set a new password.`"
        class="text-left"
      />
      <UButton v-if="sent === 'confirm'" label="Send it again" color="neutral" variant="ghost" size="sm" @click="resend" />
      <UButton v-if="sent === 'reset'" label="Back to sign in" color="neutral" variant="link" size="sm" @click="emit('switch', 'sign-in')" />
    </template>

    <template v-else>
      <UButton
        block
        size="lg"
        icon="i-simple-icons-google"
        label="Continue with Google"
        color="neutral"
        variant="outline"
        :loading="googleLoading"
        @click="google"
      />

      <USeparator label="or" class="w-full" />

      <form class="w-full space-y-3 text-left" @submit.prevent="ready && submit()">
        <UFormField label="Email">
          <UInput v-model="email" type="email" autocomplete="email" class="w-full" />
        </UFormField>
        <UFormField
          v-if="mode !== 'reset'"
          label="Password"
          :help="mode === 'sign-up' ? 'At least 8 characters' : undefined"
        >
          <template v-if="mode === 'sign-in'" #hint>
            <button type="button" class="text-xs text-muted hover:text-default" @click="emit('switch', 'reset')">
              Forgot password?
            </button>
          </template>
          <UInput
            v-model="password"
            type="password"
            :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
            class="w-full"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error">
          {{ error }}
        </p>
        <UButton
          type="submit"
          block
          size="lg"
          :label="mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset link'"
          :loading="loading"
          :disabled="!ready"
        />
      </form>
    </template>
  </div>
</template>
