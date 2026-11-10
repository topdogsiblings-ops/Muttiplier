<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// An organisation's pages: the top bar (Kreate, the organisation, your photo) across the top, and
// below it the organisation's sidebar and the page.
const { isAdmin } = useAccess()
const route = useRoute()

// the organisation's chat: one live subscription for the whole app, and the unread count on its button
const { currentOrg } = useOrg()
const chat = useChat()
let chatChannel: ReturnType<typeof chat.subscribe> | null = null
onMounted(() => {
  if (!currentOrg.value) return
  chat.refreshUnread().catch(() => {})
  chatChannel = chat.subscribe(currentOrg.value.id, () => {
    if (route.path === '/chat') chat.markRead().catch(() => {})
    else chat.unread.value++
  })
})
onBeforeUnmount(() => {
  if (chatChannel) useSupabaseClient().removeChannel(chatChannel)
})

const items = computed<NavigationMenuItem[]>(() => [
  { label: 'Chat', icon: 'i-lucide-messages-square', to: '/chat', ...(chat.unread.value ? { badge: { label: chat.unread.value > 99 ? '99+' : String(chat.unread.value), color: 'primary' as const, variant: 'solid' as const } } : {}) },
  { label: 'Library', icon: 'i-lucide-library', to: '/library' },
  { label: 'Planner', icon: 'i-lucide-clapperboard', to: '/shoots', active: route.path.startsWith('/shoots') },
  { label: 'Brands', icon: 'i-lucide-store', to: '/brands', active: route.path.startsWith('/brands') },
  ...(isAdmin.value ? [{ label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }] : [])
])

// Opening an organisation without an AI app connected: a toast that stays until it's closed,
// pointing to Connect your AI (once per visit, not on every page)
const { grants, load: loadAiApps } = useAiApps()
const toast = useToast()
const aiNudged = useState('ai-nudged', () => false)
onMounted(async () => {
  if (aiNudged.value) return
  aiNudged.value = true
  try {
    await loadAiApps()
  } catch {
    return
  }
  if (grants.value.length) return
  toast.add({
    id: 'connect-your-ai',
    title: 'Use your own AI with Kreate',
    description: 'Connect Claude, ChatGPT or another AI app to write hooks, CTAs and VOs in your voice.',
    icon: 'i-lucide-plug',
    color: 'neutral',
    duration: 0,
    close: true,
    actions: [{ label: 'Connect your AI', icon: 'i-lucide-arrow-right', color: 'neutral', variant: 'outline', to: '/account?tab=ai' }]
  })
})

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

        </template>
      </UDashboardSidebar>

      <slot />
    </UDashboardGroup>
  </div>
</template>
