<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// An organisation's pages: the top bar (Kreate, the organisation, your photo) across the top, and
// below it the organisation's sidebar and the page.
const { isAdmin } = useAccess()
const route = useRoute()

const items = computed<NavigationMenuItem[]>(() => [
  { label: 'Library', icon: 'i-lucide-library', to: '/library' },
  { label: 'Planner', icon: 'i-lucide-clapperboard', to: '/shoots', active: route.path.startsWith('/shoots') },
  { label: 'Brands', icon: 'i-lucide-store', to: '/brands', active: route.path.startsWith('/brands') },
  ...(isAdmin.value ? [{ label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }] : [])
])

// Connect your AI stays at the foot of the pane until they've connected an AI app
const { grants, loaded: aiLoaded, load: loadAiApps } = useAiApps()
onMounted(() => loadAiApps().catch(() => {}))
const showConnectAi = computed(() => aiLoaded.value && grants.value.length === 0)

/** the collapsed pane's labels: beside each icon, centred on it, as soon as it's hovered */
const tooltip = { delayDuration: 0, content: { side: 'right' as const, align: 'center' as const } }
</script>

<template>
  <div class="flex h-dvh flex-col">
    <AppTopBar />

    <UDashboardGroup class="relative inset-auto min-h-0 flex-1">
      <UDashboardSidebar collapsible>
        <template #default="{ collapsed }">
          <UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" :tooltip="tooltip" />

          <!-- Connect your AI (in Your account), at the foot of the pane, until they've connected one -->
          <UTooltip v-if="showConnectAi" text="Connect your AI" :disabled="!collapsed" v-bind="tooltip">
            <UButton
              to="/account#ai"
              icon="i-lucide-plug"
              :label="collapsed ? undefined : 'Connect your AI'"
              color="neutral"
              variant="outline"
              block
              :square="collapsed"
              class="mt-auto"
              aria-label="Connect your AI"
            />
          </UTooltip>
        </template>
      </UDashboardSidebar>

      <slot />
    </UDashboardGroup>
  </div>
</template>
