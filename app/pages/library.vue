<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { load } = useRefData()
await load()

// `help` is shown from the question mark beside each tab.
const tabs = [
  {
    label: 'Hooks',
    value: 'hooks',
    icon: 'i-lucide-anchor',
    help: 'The opening line that stops the scroll, said on camera with sync audio. A line that says {{dog}} is filmed once per channel; one that doesn\'t is filmed once and used on every channel.'
  },
  {
    label: 'CTAs',
    value: 'ctas',
    icon: 'i-lucide-megaphone',
    help: 'The closing call to action. Sync CTAs are said on camera; VO CTAs are recorded as voiceover and laid over b-roll.'
  },
  {
    label: 'VOs',
    value: 'vos',
    icon: 'i-lucide-mic',
    help: 'The voiceover scripts between the hook and the CTA, with b-roll underneath. Each is written by one person on the cast (only they perform it) about one core feature of one product, and built on a format, beat by beat. Listed by brand and product. Add a product\'s features on its brand page.'
  },
  {
    label: 'Formats',
    value: 'formats',
    icon: 'i-lucide-layout-template',
    help: 'A format is the structure of a VO: its beats and target length. Any CTA can follow any VO. Each format shows how many VOs are built on it.'
  },
  {
    label: 'Angles',
    value: 'angles',
    icon: 'i-lucide-compass',
    help: 'The persuasive approach a hook or VO takes, such as Curiosity, Problem or Testimonial: why the viewer should care. A format is how the VO is built (its beats), so any angle can be used with any format. Angles tag and filter templates.'
  }
]

// The open tab lives in the URL so it survives reloads and can be linked.
const tab = computed({
  // the old "bodies" tab is now VOs
  get: () => route.query.tab === 'bodies' ? 'vos' : tabs.some(t => t.value === route.query.tab) ? String(route.query.tab) : 'hooks',
  set: value => router.replace({ query: { tab: value } })
})
</script>

<template>
  <UDashboardPanel id="library">
    <template #header>
      <UDashboardNavbar title="Library">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <!-- The tabs' own bottom border is the toolbar's divider, so the active indicator sits on it.
           On phones the tabs are icons only; the label stays for screen readers. -->
      <UDashboardToolbar class="items-end overflow-visible border-b-0 px-0 sm:px-0">
        <UTabs
          v-model="tab"
          :items="tabs"
          :content="false"
          variant="link"
          class="w-full min-w-0"
          :ui="{ list: 'overflow-x-auto overflow-y-hidden border-b-0 px-4 shadow-[inset_0_-1px_0_var(--ui-border)] sm:px-6', indicator: 'bottom-0', label: 'truncate max-sm:sr-only' }"
        >
          <template #trailing="{ item }">
            <UPopover :content="{ side: 'bottom', align: 'start' }">
              <span
                role="button"
                tabindex="0"
                :aria-label="`What are ${item.label}?`"
                class="inline-flex rounded-full text-dimmed hover:text-default"
                @keydown.enter.stop
              >
                <UIcon name="i-lucide-circle-help" class="size-4" />
              </span>
              <template #content>
                <p class="max-w-xs p-3 text-sm text-default">
                  {{ item.help }}
                </p>
              </template>
            </UPopover>
          </template>
        </UTabs>
      </UDashboardToolbar>
    </template>

    <template #body>
      <LibraryHooks v-if="tab === 'hooks'" />
      <LibraryCtas v-else-if="tab === 'ctas'" />
      <LibraryVos v-else-if="tab === 'vos'" />
      <LibraryFormats v-else-if="tab === 'formats'" />
      <LibraryAngles v-else />
    </template>
  </UDashboardPanel>
</template>
