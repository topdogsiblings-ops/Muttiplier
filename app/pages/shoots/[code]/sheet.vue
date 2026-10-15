<script setup lang="ts">
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { BundleItem, ShotGroup } from '#shared/utils/shootsheet'
import type { Row } from '#shared/types/models'

// On-set shot sheet (spec §10a): phone-first, big tap targets, saves on every tap.
definePageMeta({ layout: 'plain' })

const route = useRoute()
const router = useRouter()
const db = useDb()
const run = useAction()
const toast = useToast()
const code = route.params.code as string

const data = ref<LoadedShoot | null>(null)
async function refresh() {
  data.value = await loadShootBundle(db, code)
}
await refresh()
if (!data.value) throw createError({ statusCode: 404, statusMessage: `Shoot ${code} not found`, fatal: true })

const bundle = computed(() => data.value!)
const shoot = computed(() => bundle.value.shoot)

// Filters live in the URL: ?person=[slug] (or everyone) and ?show=hook|cta|body|broll (or everything).
const person = computed(() => bundle.value.people.find(p => p.slug === route.query.person) ?? null)
type Show = 'all' | 'hook' | 'cta' | 'body' | 'broll'
const show = computed<Show>(() => (['hook', 'cta', 'body', 'broll'] as const).find(value => value === route.query.show) ?? 'all')
function setFilter(next: { person?: string | null, show?: Show }) {
  const query: Record<string, string> = {}
  const slug = next.person === undefined ? person.value?.slug : next.person
  const kind = next.show ?? show.value
  if (slug) query.person = slug
  if (kind !== 'all') query.show = kind
  router.replace({ query })
}
const setPerson = (slug: string | null) => setFilter({ person: slug })
const showOptions = computed(() => [
  { value: 'all' as const, label: 'Everything' },
  { value: 'hook' as const, label: 'Hooks', count: shotListFor('hook') },
  { value: 'cta' as const, label: 'CTAs', count: shotListFor('cta') },
  { value: 'body' as const, label: 'VOs', count: shotListFor('body') },
  { value: 'broll' as const, label: 'B-roll', count: bundle.value.broll.length }
])

// A person linked to the signed-in user opens on their own shots.
const { access } = useAccess()
onMounted(() => {
  if (route.query.person) return
  const mine = bundle.value.people.find(p => p.allowed_user_id && p.allowed_user_id === access.value?.id)
  if (mine) setPerson(mine.slug)
})

const personName = (id: string) => bundle.value.people.find(p => p.id === id)?.name ?? ''
const channelName = (id: string | null) => bundle.value.channels.find(c => c.id === id)?.name ?? null


// Everyone films the same shot list: one entry per item, with each person's tick underneath.
const personItems = computed(() => bundle.value.items.filter(item => !person.value || item.person_id === person.value.id))
/** how many hooks / CTAs / VOs this person (or everyone) has, for the filter buttons */
const shotListFor = (kind: string) => groupShotList(personItems.value).filter(group => group.kind === kind).length
const visibleItems = computed(() => {
  if (show.value === 'broll') return []
  return personItems.value.filter(item => show.value === 'all' || item.kind === show.value)
})
const showBroll = computed(() => show.value === 'all' || show.value === 'broll')
const shotList = computed(() => groupShotList(visibleItems.value))
const groupChannel = (group: ShotGroup) => group.items[0]?.channel_id ?? null

/** Hooks, then CTAs, then VOs (recorded off set). Everything is used for every channel. */
const sections = computed(() => {
  const hooks = shotList.value.filter(group => group.kind === 'hook')
  const list = [
    { title: 'Hooks', hint: 'Used for every channel', groups: hooks },
    { title: 'CTAs', hint: '', groups: shotList.value.filter(group => group.kind === 'cta') },
    { title: 'VOs', hint: 'Recorded off set', groups: shotList.value.filter(group => group.kind === 'body') }
  ]
  return list
    .filter(section => section.groups.length)
    .map(section => {
      const items = section.groups.flatMap(group => group.items)
      return { ...section, done: items.filter(item => item.status !== 'planned').length, total: items.length }
    })
})

/** B-roll is one shared list, by beat. */
const brollGroups = computed(() => {
  const beats = [...new Set(bundle.value.broll.map(shot => shot.beat))]
  return beats.map(beat => ({
    title: beat,
    shots: bundle.value.broll.filter(shot => shot.beat === beat).sort((a, b) => a.sort_order - b.sort_order)
  }))
})

/** Ticked off out of what's showing (b-roll counts when it's on screen). */
const progress = computed(() => {
  const entries = [...visibleItems.value, ...(showBroll.value ? bundle.value.broll : [])]
  return { done: entries.filter(entry => entry.status !== 'planned').length, total: entries.length }
})

/** Lines where someone has their own wording, for the everyone view. */
const ownVersions = (group: ShotGroup) => group.items.filter(item => item.script_override !== null && item.script_override !== undefined)
const script = (item: BundleItem) => resolveItemScript(bundle.value, item)

/** Everything on the shoot (all people) still to film or skip. */
const remaining = computed(() =>
  [...bundle.value.items, ...bundle.value.broll].filter(entry => entry.status === 'planned').length
)
const controls = useTemplateRef<{ start: () => Promise<void>, end: () => void }>('controls')

/**
 * After a tick: the first shot filmed on a planned shoot starts it, and once nothing is
 * left we offer to end it (ending is always a person's call).
 */
async function afterTick(next: string) {
  if (shoot.value.status === 'planned' && next === 'filmed') {
    await controls.value?.start()
  } else if (shoot.value.status === 'shooting' && remaining.value === 0) {
    toast.add({
      title: 'Everything is ticked off',
      description: 'End the shoot when you\'re wrapped.',
      color: 'success',
      icon: 'i-lucide-party-popper',
      actions: [{ label: 'End shoot', color: 'error', onClick: () => controls.value?.end() }]
    })
  }
}

async function saveStatus(item: BundleItem, next: string) {
  const ok = await run(async () => {
    must(await db.from('shoot_items').update({ status: next }).eq('id', item.id))
    item.status = next
  })
  if (ok) await afterTick(next)
}

/** Toggle one status on and off (person view). */
const setStatus = (item: BundleItem, status: string) => saveStatus(item, item.status === status ? 'planned' : status)

/** Everyone view: each tap moves a person on: not done -> filmed -> skipped -> not done. */
const cycleStatus = (item: BundleItem) =>
  saveStatus(item, item.status === 'planned' ? 'filmed' : item.status === 'filmed' ? 'skipped' : 'planned')

/** Every clip is the keeper, so b-roll is ticked off clip by clip: a box per required clip. */
const clipCount = (shot: Row<'broll_shots'>) => Math.max(1, shot.min_clips)
async function saveBroll(shot: Row<'broll_shots'>, patch: { status: string, clips_filmed: number }) {
  const ok = await run(async () => {
    must(await db.from('broll_shots').update(patch).eq('id', shot.id))
    Object.assign(shot, patch)
  })
  if (ok) await afterTick(patch.status)
}

/** Ticking a box adds a clip, unticking takes one off; the shot is filmed once all its clips are in. */
function toggleClip(shot: Row<'broll_shots'>, index: number) {
  const clips = Math.min(shot.clips_filmed, clipCount(shot))
  const next = index < clips ? clips - 1 : clips + 1
  saveBroll(shot, { clips_filmed: next, status: next >= clipCount(shot) ? 'filmed' : 'planned' })
}

function skipBroll(shot: Row<'broll_shots'>) {
  const skipped = shot.status === 'skipped'
  saveBroll(shot, {
    clips_filmed: shot.clips_filmed,
    status: skipped ? (shot.clips_filmed >= clipCount(shot) ? 'filmed' : 'planned') : 'skipped'
  })
}

</script>

<template>
  <div class="mx-auto max-w-3xl px-3 pb-16 sm:px-6">
    <header class="sticky top-0 z-10 -mx-3 border-b border-default bg-default/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          :to="`/shoots/${shoot.code}`"
          aria-label="Back to shoot"
        />
        <div class="min-w-0 flex-1">
          <h1 class="truncate font-semibold text-highlighted">
            <span class="font-mono">{{ shoot.code }}</span> · {{ bundle.product.name }}
          </h1>
          <p class="truncate text-xs text-muted">
            {{ bundle.brand.name }} · {{ formatDate(shoot.shoot_date) }}
            <template v-if="shoot.location_notes">
              · {{ shoot.location_notes }}
            </template>
            <template v-if="person">
              · {{ person.name }}
            </template>
          </p>
        </div>
        <ShootElapsed :shoot="shoot" />
        <span class="text-sm font-medium text-highlighted tabular-nums">{{ progress.done }}/{{ progress.total }}</span>
        <div>
          <ShootControls ref="controls" :shoot="shoot" :remaining="remaining" size="sm" @changed="refresh" />
        </div>
      </div>

      <div class="mt-2 flex gap-1.5 overflow-x-auto">
        <UButton
          label="Everyone"
          size="sm"
          :color="person ? 'neutral' : 'primary'"
          :variant="person ? 'subtle' : 'solid'"
          @click="setPerson(null)"
        />
        <UButton
          v-for="p in bundle.people"
          :key="p.id"
          :label="p.name"
          size="sm"
          :color="person?.id === p.id ? 'primary' : 'neutral'"
          :variant="person?.id === p.id ? 'solid' : 'subtle'"
          @click="setPerson(p.slug)"
        />
      </div>
      <div class="mt-1.5 flex gap-1.5 overflow-x-auto">
        <UButton
          v-for="option in showOptions"
          :key="option.value"
          :label="option.label"
          size="xs"
          :color="show === option.value ? 'primary' : 'neutral'"
          :variant="show === option.value ? 'soft' : 'ghost'"
          @click="setFilter({ show: option.value })"
        >
          <template v-if="option.count !== undefined" #trailing>
            <span class="text-xs tabular-nums opacity-70">{{ option.count }}</span>
          </template>
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="shoot.status === 'draft'"
      class="mt-4"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This shoot is still a draft"
      description="Codes and scripts can still change. Mark the shoot as planned before filming from this sheet."
    />
    <UAlert
      v-else-if="shoot.status === 'planned'"
      class="mt-4"
      color="info"
      variant="subtle"
      icon="i-lucide-clapperboard"
      title="Ready when you are"
      description="Press Start shoot, or just tick off the first shot and the shoot starts automatically."
    />

    <section v-for="section in sections" :key="section.title" class="mt-6">
      <h2 class="mb-2 flex items-baseline gap-2 text-sm font-semibold text-highlighted uppercase">
        {{ section.title }}
        <span v-if="section.hint" class="text-xs font-normal text-muted normal-case">{{ section.hint }}</span>
        <span class="ml-auto text-xs font-normal text-muted tabular-nums">{{ section.done }}/{{ section.total }}</span>
      </h2>

      <div class="space-y-2">
        <template v-for="group in section.groups" :key="group.key">
          <!-- one person: a single big tick -->
          <template v-if="person">
            <article
              v-for="item in group.items"
              :key="item.id"
              class="flex gap-3 rounded-lg border border-default p-3"
              :class="{
                'border-success/40 bg-success/5': item.status === 'filmed',
                'opacity-60': item.status === 'skipped'
              }"
            >
              <button
                type="button"
                class="flex size-12 shrink-0 items-center justify-center rounded-full border-2 transition"
                :class="item.status === 'filmed' ? 'border-success bg-success text-inverted' : 'border-accented text-transparent'"
                :aria-label="item.status === 'filmed' ? `Mark ${item.code} as not filmed` : `Mark ${item.code} as filmed`"
                :aria-pressed="item.status === 'filmed'"
                @click="setStatus(item, 'filmed')"
              >
                <UIcon name="i-lucide-check" class="size-7" />
              </button>

              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="font-mono text-base font-bold text-highlighted">{{ item.code }}</span>
                  <UBadge v-if="channelName(item.channel_id)" :label="channelName(item.channel_id)!" color="neutral" variant="outline" size="sm" />
                  <UBadge v-if="item.angle" :label="item.angle" color="neutral" variant="subtle" size="sm" />
                  <UBadge v-if="item.cta_mode" :label="item.cta_mode" color="info" variant="subtle" size="sm" />
                  <UBadge v-if="item.universal" label="universal" color="primary" variant="subtle" size="sm" />
                  <UBadge v-if="item.status === 'skipped'" label="skipped" color="warning" variant="subtle" size="sm" />
                  <span v-if="item.location" class="flex items-center gap-0.5 text-xs text-muted">
                    <UIcon name="i-lucide-map-pin" />{{ item.location }}
                  </span>
                </div>

                <template v-if="item.kind === 'body'">
                  <p v-if="item.title" class="text-sm font-medium text-muted">
                    {{ item.title }}
                  </p>
                  <p v-for="beat in script(item).beats" :key="beat.beat" class="text-base leading-snug text-highlighted">
                    <span class="mr-1 text-xs font-semibold text-muted uppercase">{{ beat.beat }}</span>{{ beat.script }}
                  </p>
                </template>
                <p v-else class="text-lg leading-snug text-highlighted" :class="{ 'line-through': item.status === 'skipped' }">
                  {{ script(item).text }}
                </p>
                <p v-if="item.filming_notes" class="flex items-start gap-1.5 rounded-md bg-elevated/60 px-2 py-1.5 text-sm text-default">
                  <UIcon name="i-lucide-video" class="mt-0.5 shrink-0 text-muted" />
                  <span><span class="font-medium">How to film:</span> {{ item.filming_notes }}</span>
                </p>

                <div class="flex justify-end">
                  <UButton
                    :label="item.status === 'skipped' ? 'Unskip' : 'Skip'"
                    size="sm"
                    color="neutral"
                    :variant="item.status === 'skipped' ? 'solid' : 'ghost'"
                    @click="setStatus(item, 'skipped')"
                  />
                </div>

              </div>
            </article>
          </template>

          <!-- everyone: the item once, with a tick per person -->
          <article
            v-else
            class="space-y-2 rounded-lg border border-default p-3"
            :class="{ 'border-success/40 bg-success/5': group.items.every(item => item.status !== 'planned') }"
          >
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-base font-bold text-highlighted">{{ group.code }}</span>
              <UBadge v-if="channelName(groupChannel(group))" :label="channelName(groupChannel(group))!" color="neutral" variant="outline" size="sm" />
              <UBadge v-if="group.items[0]!.angle" :label="group.items[0]!.angle!" color="neutral" variant="subtle" size="sm" />
              <UBadge v-if="group.items[0]!.cta_mode" :label="group.items[0]!.cta_mode!" color="info" variant="subtle" size="sm" />
              <UBadge v-if="group.items[0]!.universal" label="universal" color="primary" variant="subtle" size="sm" />
              <span v-if="group.items[0]!.location" class="flex items-center gap-0.5 text-xs text-muted">
                <UIcon name="i-lucide-map-pin" />{{ group.items[0]!.location }}
              </span>
            </div>

            <template v-if="group.kind === 'body'">
              <p v-if="group.items[0]!.title" class="text-sm font-medium text-muted">
                {{ group.items[0]!.title }}
              </p>
              <p v-for="beat in script(group.items[0]!).beats" :key="beat.beat" class="text-base leading-snug text-highlighted">
                <span class="mr-1 text-xs font-semibold text-muted uppercase">{{ beat.beat }}</span>{{ beat.script }}
              </p>
            </template>
            <p v-else class="text-lg leading-snug text-highlighted">
              {{ script({ ...group.items[0]!, script_override: null }).text }}
            </p>
            <p v-if="group.items[0]!.filming_notes" class="flex items-start gap-1.5 rounded-md bg-elevated/60 px-2 py-1.5 text-sm text-default">
              <UIcon name="i-lucide-video" class="mt-0.5 shrink-0 text-muted" />
              <span><span class="font-medium">How to film:</span> {{ group.items[0]!.filming_notes }}</span>
            </p>
            <p v-for="item in ownVersions(group)" :key="`own-${item.id}`" class="text-sm text-muted">
              <span class="font-medium text-default">{{ personName(item.person_id) }}'s version:</span>
              {{ script(item).beats ? script(item).beats!.map(beat => beat.script).join(' ') : script(item).text }}
            </p>

            <!-- one tap per person: not done -> filmed -> skipped -> not done -->
            <div class="flex flex-wrap gap-2 pt-1">
              <button
                v-for="item in group.items"
                :key="item.id"
                type="button"
                class="inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-3 text-sm font-medium transition"
                :class="item.status === 'filmed'
                  ? 'border-success bg-success text-inverted'
                  : item.status === 'skipped'
                    ? 'border-warning/50 text-muted line-through'
                    : 'border-accented text-highlighted'"
                :aria-label="`${personName(item.person_id)}: ${item.status === 'planned' ? 'not done' : item.status}. Tap to change.`"
                @click="cycleStatus(item)"
              >
                <UIcon
                  :name="item.status === 'filmed' ? 'i-lucide-check' : item.status === 'skipped' ? 'i-lucide-skip-forward' : 'i-lucide-circle'"
                  class="size-4"
                />
                {{ personName(item.person_id) }}
              </button>
            </div>
          </article>
        </template>
      </div>
    </section>

    <p v-if="!person && sections.length" class="mt-3 text-xs text-muted">
      Tap a name to mark it filmed, again for skipped, and again to clear.
    </p>
    <section v-if="showBroll && brollGroups.length" class="mt-8">
      <h2 class="mb-2 text-sm font-semibold text-highlighted uppercase">
        B-roll
      </h2>
      <div v-for="group in brollGroups" :key="group.title" class="mb-4">
        <h3 class="mb-1.5 text-xs font-medium text-muted uppercase">
          {{ group.title }}
        </h3>
        <div class="space-y-1.5">
          <div
            v-for="shot in group.shots"
            :key="shot.id"
            class="rounded-lg border border-default px-3 py-2"
            :class="{
              'border-success/40 bg-success/5': shot.status === 'filmed',
              'opacity-60': shot.status === 'skipped'
            }"
          >
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-highlighted" :class="{ 'line-through': shot.status === 'skipped' }">
                  {{ shot.description || 'Untitled shot' }}
                </p>
                <p class="text-xs text-muted">
                  {{ Math.min(shot.clips_filmed, clipCount(shot)) }}/{{ clipCount(shot) }} clips
                  <template v-if="shot.product_visible">
                    · product visible
                  </template>
                </p>
              </div>
              <UButton
                :label="shot.status === 'skipped' ? 'Unskip' : 'Skip'"
                size="sm"
                color="neutral"
                :variant="shot.status === 'skipped' ? 'solid' : 'ghost'"
                @click="skipBroll(shot)"
              />
            </div>
            <!-- one box per clip -->
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="(_, index) in clipCount(shot)"
                :key="index"
                type="button"
                class="flex size-11 items-center justify-center rounded-lg border-2 text-sm font-semibold tabular-nums"
                :class="index < shot.clips_filmed ? 'border-success bg-success text-inverted' : 'border-accented text-muted'"
                :disabled="shot.status === 'skipped'"
                :aria-label="`Clip ${index + 1} of ${clipCount(shot)}: ${shot.description}`"
                :aria-pressed="index < shot.clips_filmed"
                @click="toggleClip(shot, index)"
              >
                <UIcon v-if="index < shot.clips_filmed" name="i-lucide-check" class="size-5" />
                <span v-else >{{ index + 1 }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <p v-if="!sections.length && !(showBroll && brollGroups.length)" class="py-16 text-center text-muted">
      <template v-if="show === 'all' && !person">
        Nothing to film yet.
      </template>
      <template v-else>
        Nothing here for this filter.
        <UButton label="Show everything" variant="link" class="p-0" @click="setFilter({ person: null, show: 'all' })" />
      </template>
    </p>
  </div>
</template>
