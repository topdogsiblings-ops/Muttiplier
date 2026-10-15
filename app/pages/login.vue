<script setup lang="ts">
definePageMeta({ layout: 'plain' })

const supabase = useSupabaseClient()
const route = useRoute()
const toast = useToast()
const loading = ref(false)

async function signIn() {
  loading.value = true
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/confirm` }
  })
  if (error) {
    loading.value = false
    toast.add({ title: 'Sign-in failed', description: error.message, color: 'error' })
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-4 text-center">
        <UIcon name="i-lucide-dog" class="size-10 text-primary" />
        <div>
          <h1 class="text-xl font-semibold text-highlighted">
            Muttiplier
          </h1>
          <p class="text-sm text-muted">
            topdogugc script library and shoot planner
          </p>
        </div>

        <UAlert
          v-if="route.query.denied"
          color="error"
          variant="subtle"
          icon="i-lucide-shield-x"
          title="No access"
          description="That Google account isn't on the allowlist. Ask an admin to add your email, then sign in again."
          class="text-left"
        />

        <UButton
          block
          size="lg"
          icon="i-simple-icons-google"
          label="Sign in with Google"
          :loading="loading"
          @click="signIn"
        />
      </div>
    </UCard>
  </div>
</template>
