<script setup lang="ts">
definePageMeta({ layout: 'plain' })

const user = useSupabaseUser()

// The allowlist check runs in the global middleware on the way to the app.
watch(user, () => {
  if (user.value) return navigateTo('/shoots')
}, { immediate: true })
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center gap-2 text-muted">
    <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    Signing you in…
  </div>
</template>
