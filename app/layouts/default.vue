<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { access, isAdmin, reset } = useAccess()
const supabase = useSupabaseClient()
const route = useRoute()

const items = computed<NavigationMenuItem[]>(() => [
  { label: 'Library', icon: 'i-lucide-library', to: '/library' },
  { label: 'Planner', icon: 'i-lucide-clapperboard', to: '/shoots', active: route.path.startsWith('/shoots') },
  { label: 'Brands', icon: 'i-lucide-store', to: '/brands', active: route.path.startsWith('/brands') },
  ...(isAdmin.value ? [{ label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }] : [])
])

async function signOut() {
  await supabase.auth.signOut()
  reset()
  await navigateTo('/login')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/shoots" class="flex w-full items-center justify-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-dog" class="size-6 text-primary" />
          <span v-if="!collapsed">Muttiplier</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full items-center gap-2">
          <div v-if="!collapsed" class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ access?.display_name || access?.email }}
            </p>
            <p class="text-xs text-muted capitalize">
              {{ access?.role }}
            </p>
          </div>
          <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" aria-label="Sign out" @click="signOut" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
