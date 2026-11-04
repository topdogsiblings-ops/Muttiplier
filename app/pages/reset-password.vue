<script setup lang="ts">
// Where a password reset link lands: Supabase signs them in from the link, and they choose a new
// password. (Left out of the sign-in redirect, so the link has time to sign them in.)
definePageMeta({ layout: 'plain' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

const password = ref('')
const saving = ref(false)
const error = ref('')

// the link signs them in as the page loads; if it hasn't after a few seconds, it's expired or used
const expired = ref(false)
onMounted(() => setTimeout(() => {
  if (!user.value) expired.value = true
}, 6000))

async function save() {
  saving.value = true
  error.value = ''
  const { error: failure } = await supabase.auth.updateUser({ password: password.value })
  saving.value = false
  if (failure) {
    error.value = failure.message
    return
  }
  toast.add({ title: 'Password changed', color: 'success' })
  await navigateTo('/shoots')
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-sm" :ui="{ body: 'space-y-4' }">
      <div class="text-center">
        <AppLogo class="mx-auto size-12 text-highlighted" />
        <h1 class="mt-2 text-xl font-semibold text-highlighted">
          Choose a new password
        </h1>
      </div>

      <template v-if="user">
        <form class="space-y-3" @submit.prevent="password.length >= 8 && save()">
          <UFormField label="New password" help="At least 8 characters">
            <UInput v-model="password" type="password" autocomplete="new-password" class="w-full" autofocus />
          </UFormField>
          <p v-if="error" class="text-sm text-error">
            {{ error }}
          </p>
          <UButton type="submit" block size="lg" label="Save password" :loading="saving" :disabled="password.length < 8" />
        </form>
      </template>
      <template v-else-if="expired">
        <p class="text-center text-sm text-muted">
          This link has expired or was already used. Ask for a new one from the sign-in page.
        </p>
        <UButton block label="Back to sign in" to="/login" color="neutral" variant="subtle" />
      </template>
      <p v-else class="flex items-center justify-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Checking your link…
      </p>
    </UCard>
  </div>
</template>
