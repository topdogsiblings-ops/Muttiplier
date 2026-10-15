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

// Only an uploaded clip ticks a deliverable off; by hand you can only skip or unskip.
const toggleSkip = (item: BundleItem) => {
  if (item.status !== 'filmed') saveStatus(item, item.status === 'skipped' ? 'planned' : 'skipped')
}
const itemUploaded = (item: BundleItem) => {
  if (item.status !== 'filmed') saveStatus(item, 'filmed')
}
const itemClipRemoved = (item: BundleItem) => {
  if (item.status === 'filmed') saveStatus(item, 'planned')
}

/** Every clip is the keeper, so b-roll is ticked off clip by clip: a box per required clip. */
const clipCount = (shot: Row<'broll_shots'>) => Math.max(1, shot.min_clips)
async function saveBroll(shot: Row<'broll_shots'>, patch: { status: string, clips_filmed: number }) {
  const ok = await run(async () => {
    must(await db.from('broll_shots').update(patch).eq('id', shot.id))
    Object.assign(shot, patch)
  })
  if (ok) await afterTick(patch.status)
}

/** Each uploaded clip fills a box (removing one empties it); the shot is filmed once all its clips are in. */
function brollClipChanged(shot: Row<'broll_shots'>, change: 1 | -1) {
  const next = Math.min(clipCount(shot), Math.max(0, Math.min(shot.clips_filmed, clipCount(shot)) + change))
  const status = shot.status === 'skipped' ? 'skipped' : next >= clipCount(shot) ? 'filmed' : 'planned'
  saveBroll(shot, { clips_filmed: next, status })
}

// Clips filmed or picked on set (spec §12); the uploader is in test mode until Dropbox is connected.
// Open question (§12 Q2): raw/ vs edited/. For now clips go to the export folders, which use edited/.
const itemClipFolder = (item: BundleItem) => itemFolder(bundle.value, item)
/** VOs and VO CTAs are recorded on the microphone; everything else is filmed. */
const clipMedia = (item: BundleItem) => item.kind === 'body' || (item.kind === 'cta' && item.cta_mode === 'vo') ? 'audio' as const : 'video' as const

// Sanity checks on submitted clips use the presets in Settings -> Defaults.
const { settings, load: loadRefData } = useRefData()
await loadRefData()
const clipRules = computed(() => clipRulesFrom(settings.value))
/** How long a recording should be: the script's reading time at the speech pace in Settings. */
const expectedSeconds = (item: BundleItem) => {
  if (clipMedia(item) !== 'audio') return 0
  const resolved = script(item)
  const text = resolved.beats ? resolved.beats.map(beat => beat.script).join(' ') : resolved.text ?? ''
  return estimateSeconds(text, Number(settings.value?.words_per_second) || DEFAULT_WORDS_PER_SECOND)
}
/** On-camera items (hooks, sync CTAs) can be filmed with their script over the camera. */
const promptScript = (item: BundleItem) => clipMedia(item) === 'video' ? script(item).text ?? undefined : undefined
const brollClipFolder = (shot: Row<'broll_shots'>) => brollFolder(bundle.value, shot)

/** Capture rows (each person's clip in the everyone view, each b-roll clip) stay folded away until opened. */
const { clipFor } = useClipUpload()
const openCapture = ref(new Set<string>())
const attachedClips = (shot: Row<'broll_shots'>) =>
  Array.from({ length: clipCount(shot) }, (_, index) => clipFor(clipTarget.broll(shot.id, index))).filter(Boolean).length
const attachedGroupClips = (group: ShotGroup) => group.items.filter(item => clipFor(clipTarget.item(item.id))).length
const captureOpen = (key: string) => openCapture.value.has(key)
function toggleCapture(key: string) {
  if (openCapture.value.has(key)) openCapture.value.delete(key)
  else openCapture.value.add(key)
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
              <div class="flex shrink-0 flex-col items-center gap-1.5">
                <!-- ticked by uploading a clip, not by hand -->
                <span
                  class="flex size-12 items-center justify-center rounded-full border-2"
                  :class="item.status === 'filmed' ? 'border-success bg-success text-inverted' : 'border-accented text-transparent'"
                  role="img"
                  :aria-label="item.status === 'filmed' ? `${item.code} uploaded` : `${item.code} not uploaded yet`"
                >
                  <UIcon name="i-lucide-check" class="size-7" />
                </span>
                <UButton
                  v-if="item.status !== 'filmed'"
                  :label="item.status === 'skipped' ? 'Unskip' : 'Skip'"
                  size="xs"
                  color="neutral"
                  :variant="item.status === 'skipped' ? 'solid' : 'ghost'"
                  @click="toggleSkip(item)"
                />
              </div>

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
                  <!-- film / record and upload, in the top row -->
                  <ClipCapture
                    v-if="item.status !== 'skipped'"
                    part="actions"
                    class="ml-auto"
                    :target="clipTarget.item(item.id)"
                    :folder="itemClipFolder(item)"
                    :label="item.code"
                    :media="clipMedia(item)"
                    :rules="clipRules"
                    :expected-seconds="expectedSeconds(item)"
                    :script="promptScript(item)"
                    @uploaded="itemUploaded(item)"
                    @removed="itemClipRemoved(item)"
                  />
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

                <!-- the attached clip -->
                <ClipCapture
                  part="clip"
                  :target="clipTarget.item(item.id)"
                  :folder="itemClipFolder(item)"
                  :label="item.code"
                  :media="clipMedia(item)"
                  @removed="itemClipRemoved(item)"
                />
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
              <!-- film / record and upload for each person, in the top row -->
              <UButton
                :icon="clipMedia(group.items[0]!) === 'audio' ? 'i-lucide-mic' : 'i-lucide-video'"
                :trailing-icon="captureOpen(`group:${group.code}`) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                color="primary"
                variant="soft"
                size="sm"
                class="ml-auto"
                :aria-expanded="captureOpen(`group:${group.code}`)"
                :aria-label="`${clipMedia(group.items[0]!) === 'audio' ? 'Record' : 'Film'} or upload clips for ${group.code}`"
                @click="toggleCapture(`group:${group.code}`)"
              >
                <span v-if="attachedGroupClips(group)" class="tabular-nums"><span class="hidden sm:inline">Clips · </span>{{ attachedGroupClips(group) }}</span>
                <span v-else class="hidden sm:inline">{{ clipMedia(group.items[0]!) === 'audio' ? 'Record / upload' : 'Film / upload' }}</span>
              </UButton>
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

            <!-- each person's status: ticked by their uploaded clip; tap to skip or unskip -->
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
                :disabled="item.status === 'filmed'"
                :aria-label="item.status === 'filmed'
                  ? `${personName(item.person_id)}: uploaded`
                  : `${personName(item.person_id)}: ${item.status === 'skipped' ? 'skipped. Tap to unskip.' : 'not uploaded yet. Tap to skip.'}`"
                @click="toggleSkip(item)"
              >
                <UIcon
                  :name="item.status === 'filmed' ? 'i-lucide-check' : item.status === 'skipped' ? 'i-lucide-skip-forward' : 'i-lucide-circle'"
                  class="size-4"
                />
                {{ personName(item.person_id) }}
              </button>
            </div>
            <!-- film or upload, one clip per person -->
            <div v-if="captureOpen(`group:${group.code}`)" class="space-y-2">
              <div v-for="item in group.items" :key="`clip-${item.id}`" class="flex items-start gap-2">
                <span class="mt-2 w-16 shrink-0 truncate text-sm font-medium text-muted">{{ personName(item.person_id) }}</span>
                <ClipCapture
                  class="min-w-0 flex-1"
                  :target="clipTarget.item(item.id)"
                  :folder="itemClipFolder(item)"
                  :label="`${group.code} for ${personName(item.person_id)}`"
                  :media="clipMedia(item)"
                  :rules="clipRules"
                  :expected-seconds="expectedSeconds(item)"
                  :script="promptScript(item)"
                  @uploaded="itemUploaded(item)"
                  @removed="itemClipRemoved(item)"
                />
              </div>
            </div>
          </article>
        </template>
      </div>
    </section>

    <p v-if="!person && sections.length" class="mt-3 text-xs text-muted">
      A name is ticked once their clip is uploaded. Tap a name to skip it, and again to unskip.
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
              <!-- film / upload, in the top row -->
              <UButton
                v-if="shot.status !== 'skipped' || attachedClips(shot)"
                icon="i-lucide-video"
                :trailing-icon="captureOpen(shot.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                color="primary"
                variant="soft"
                size="sm"
                :aria-expanded="captureOpen(shot.id)"
                :aria-label="`Film or upload clips for ${shot.description || 'this shot'}`"
                @click="toggleCapture(shot.id)"
              >
                <span v-if="attachedClips(shot)" class="tabular-nums"><span class="hidden sm:inline">Clips · </span>{{ attachedClips(shot) }}</span>
                <span v-else class="hidden sm:inline">Film / upload</span>
              </UButton>
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
              <span
                v-for="(_, index) in clipCount(shot)"
                :key="index"
                class="flex size-11 items-center justify-center rounded-lg border-2 text-sm font-semibold tabular-nums"
                :class="index < shot.clips_filmed ? 'border-success bg-success text-inverted' : 'border-accented text-muted'"
                role="img"
                :aria-label="`Clip ${index + 1} of ${clipCount(shot)}: ${index < shot.clips_filmed ? 'uploaded' : 'not uploaded yet'}`"
              >
                <UIcon v-if="index < shot.clips_filmed" name="i-lucide-check" class="size-5" />
                <span v-else>{{ index + 1 }}</span>
              </span>
            </div>
            <!-- film or upload, one clip per box -->
            <div v-if="captureOpen(shot.id)" class="mt-2 space-y-2">
              <div v-for="(_, index) in clipCount(shot)" :key="index" class="flex items-start gap-2">
                <span class="mt-2 w-5 shrink-0 text-center text-sm font-semibold text-muted tabular-nums">{{ index + 1 }}</span>
                <ClipCapture
                  class="min-w-0 flex-1"
                  :target="clipTarget.broll(shot.id, index)"
                  :folder="brollClipFolder(shot)"
                  :rules="clipRules"
                  :label="`clip ${index + 1} of ${shot.description || 'this shot'}`"
                  @uploaded="brollClipChanged(shot, 1)"
                  @removed="brollClipChanged(shot, -1)"
                />
              </div>
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
