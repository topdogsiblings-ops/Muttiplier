<script setup lang="ts">
definePageMeta({ layout: 'plain' })

const user = useSupabaseUser()
const redirect = useSupabaseCookieRedirect()

// The org check runs in the global middleware on the way to the app. Back to the page that sent
// them to sign in, if any (only paths in this app).
watch(user, () => {
  if (!user.value) return
  const path = redirect.pluck()
  // a real page they were sent from (e.g. Klip's activation link); otherwise Your account → Organisations
  return navigateTo(path?.startsWith('/') && !path.startsWith('//') && path !== '/' ? path : '/account')
}, { immediate: true })
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center gap-2 text-muted">
    <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    Signing you in…
  </div>
</template>
