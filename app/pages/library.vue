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
    help: 'The opening line that stops the scroll, said on camera with sync audio. A line that says {{dog}} is filmed once per channel; one that doesn\'t is filmed once and used on every channel. Types are the kind of opening each hook uses (Confession, Curiosity, Newness…).'
  },
  {
    label: 'CTAs',
    value: 'ctas',
    icon: 'i-lucide-megaphone',
    help: 'The closing call to action. Sync CTAs are said on camera; VO CTAs are recorded as voiceover and laid over b-roll.'
  },
  {
    label: 'Formats',
    value: 'formats',
    icon: 'i-lucide-layout-template',
    help: 'A format is the structure of a VO: its beats and target length. Any CTA can follow any VO. VOs themselves are written in each shoot, for its product. Each format shows how many VOs are built on it.'
  },
  {
    label: 'Treatments',
    value: 'treatments',
    icon: 'i-lucide-wand-sparkles',
    help: 'Ways a finished video is presented: face to camera or over b-roll, a search bar, a text thread, greenscreen… Every one switched on is applied to every recipe that has what it needs, as an extra version.'
  }
]

// Hooks has two views: the hook scripts, and the types they're tagged with
const hookViews = [
  { label: 'Scripts', value: 'scripts', icon: 'i-lucide-text-quote' },
  { label: 'Types', value: 'types', icon: 'i-lucide-compass' }
]

// The open tab (and the Hooks view) live in the URL so they survive reloads and can be linked.
// The old Angles and Hook types tabs open Hooks → Types.
const oldTypesTab = computed(() => route.query.tab === 'angles' || route.query.tab === 'hook-types')
const tab = computed({
  get: () => oldTypesTab.value ? 'hooks' : tabs.some(t => t.value === route.query.tab) ? String(route.query.tab) : 'hooks',
  set: value => router.replace({ query: { tab: value } })
})
const hookView = computed({
  get: () => oldTypesTab.value || route.query.view === 'types' ? 'types' : 'scripts',
  set: value => router.replace({ query: { tab: 'hooks', ...(value === 'types' ? { view: 'types' } : {}) } })
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
      <template v-if="tab === 'hooks'">
        <UTabs
          v-model="hookView"
          :items="hookViews"
          :content="false"
          size="sm"
          color="primary"
          class="mb-4 w-full sm:w-auto sm:self-start"
        />
        <LibraryHooks v-if="hookView === 'scripts'" />
        <LibraryHookTypes v-else />
      </template>
      <LibraryCtas v-else-if="tab === 'ctas'" />
      <LibraryFormats v-else-if="tab === 'formats'" />
      <LibraryTreatments v-else />
    </template>
  </UDashboardPanel>
</template>
