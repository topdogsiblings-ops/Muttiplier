<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Json } from '#shared/types/database.types'
import type { Insert, Update } from '#shared/types/models'
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { BundleItem, ShotGroup } from '#shared/utils/shootsheet'
import type { Beat } from '#shared/utils/slots'
import type { PickedItems } from '~/components/planner/ItemPicker.vue'
import type { BrollFormat } from '~/components/planner/Broll.vue'

const route = useRoute()
const db = useDb()
const run = useAction()
const { confirmDialog } = useConfirm()
const toast = useToast()
const { people: allPeople, channels: allChannels, productOptions, settings, load } = useRefData()
const code = route.params.code as string

const data = ref<LoadedShoot | null>(null)
async function refresh() {
  data.value = await loadShootBundle(db, code)
}
await Promise.all([load(), refresh()])
if (!data.value) throw createError({ statusCode: 404, statusMessage: `Shoot ${code} not found`, fatal: true })

const bundle = computed(() => data.value!)
const shoot = computed(() => bundle.value.shoot)
const isDraft = computed(() => shoot.value.status === 'draft')
const channelIds = computed(() => bundle.value.channels.map(channel => channel.id))
const busy = ref(false)

// --- setup -----------------------------------------------------------------
const form = reactive({
  product_id: '',
  shoot_date: '',
  submission_pct: 5,
  runway_target: 60,
  kit: 'custom',
  location_notes: '',
  notes: ''
})
watch(shoot, (value) => {
  Object.assign(form, {
    product_id: value.product_id,
    shoot_date: value.shoot_date ?? '',
    submission_pct: Math.round(Number(value.submission_rate) * 1000) / 10,
    runway_target: value.runway_target,
    kit: value.kit,
    location_notes: value.location_notes ?? '',
    notes: value.notes ?? ''
  })
}, { immediate: true })


const kits = selectOptions(['audition', 'scale', 'custom'])

async function patchShoot(patch: Update<'shoots'>) {
  await run(async () => {
    must(await db.from('shoots').update(patch).eq('id', shoot.value.id))
    await refresh()
  })
}

const saveSetup = () => patchShoot({
  product_id: form.product_id,
  shoot_date: form.shoot_date || null,
  submission_rate: Math.min(100, Math.max(0, Number(form.submission_pct) || 0)) / 100,
  runway_target: Math.max(1, Math.round(Number(form.runway_target) || 1)),
  kit: form.kit,
  location_notes: form.location_notes.trim() || null,
  notes: form.notes.trim() || null
})

// --- people and channels ---------------------------------------------------
const peopleOptions = computed(() => allPeople.value
  .filter(person => person.active || bundle.value.people.some(p => p.id === person.id))
  .map(person => ({ label: person.name, value: person.id })))
const channelOptions = computed(() => allChannels.value
  .filter(channel => channel.active || channelIds.value.includes(channel.id))
  .map(channel => ({ label: channel.name, value: channel.id })))
const personIds = computed(() => bundle.value.people.map(person => person.id))

async function setPeople(next: string[]) {
  const added = next.filter(id => !personIds.value.includes(id))
  const removed = personIds.value.filter(id => !next.includes(id))
  for (const id of removed) {
    const count = bundle.value.items.filter(item => item.person_id === id).length
    const name = bundle.value.people.find(person => person.id === id)?.name
    if (count && !(await confirmDialog({
      title: `Remove ${name} from this shoot?`,
      description: `Their ${count} item${count === 1 ? '' : 's'} on the structure go too, along with any per-person wording and ticks.`,
      confirmLabel: 'Remove',
      danger: true
    }))) return
  }
  await run(async () => {
    if (added.length) {
      must(await db.from('shoot_people').insert(added.map(person_id => ({ shoot_id: shoot.value.id, person_id }))))
      // everyone films the whole shot list (apart from VOs someone else wrote for themselves),
      // once for each of the shoot's channels they're linked to
      const rows = added.flatMap(person_id => groups.value
        .filter(group => !group.items[0]!.writer_id || group.items[0]!.writer_id === person_id)
        .flatMap(group => channelsFor(bundle.value, person_id).map(channel => copyFor(group, person_id, channel.id))))
      if (rows.length) must(await db.from('shoot_items').insert(rows))
    }
    // items go with the person (cascade)
    if (removed.length) must(await db.from('shoot_people').delete().eq('shoot_id', shoot.value.id).in('person_id', removed))
    await refresh()
  })
}

async function setChannels(next: string[]) {
  const added = next.filter(id => !channelIds.value.includes(id))
  const removed = channelIds.value.filter(id => !next.includes(id))
  await run(async () => {
    if (added.length) {
      must(await db.from('shoot_channels').insert(added.map(channel_id => ({ shoot_id: shoot.value.id, channel_id }))))
      // everyone linked to a new channel films the shot list for it too
      const links = must(await db.from('person_channels').select('person_id, channel_id').in('channel_id', added))
      const rows = added.flatMap(channel_id => bundle.value.people
        .filter(person => links.some(link => link.person_id === person.id && link.channel_id === channel_id))
        .flatMap(person => groups.value
          .filter(group => !group.items[0]!.writer_id || group.items[0]!.writer_id === person.id)
          .map(group => copyFor(group, person.id, channel_id))))
      if (rows.length) must(await db.from('shoot_items').insert(rows))
    }
    if (removed.length) {
      must(await db.from('broll_shots').delete().eq('shoot_id', shoot.value.id).in('channel_id', removed))
      must(await db.from('shoot_items').delete().eq('shoot_id', shoot.value.id).in('channel_id', removed))
      must(await db.from('shoot_channels').delete().eq('shoot_id', shoot.value.id).in('channel_id', removed))
    }
    await refresh()

  })
}

// --- shot list ---------------------------------------------------------------
// Everyone on the shoot films the same list, once for each channel they're linked to: each
// hook / VO / CTA is one entry with one shared code and location, and there's an item per
// person per channel underneath for its own clip, status and, optionally, own wording.
const groups = computed(() => groupShotList(bundle.value.items))
const groupsOf = (kind: string) => groups.value.filter(group => group.kind === kind)

// --- adding and removing -----------------------------------------------------
const pickerOpen = ref(false)
const existingTemplates = computed(() => groups.value.map(group => group.template_id))

/** A person's item for one channel, copying a shot-list entry (someone joins, or a channel is added). */
function copyFor(group: ShotGroup, person_id: string, channel_id: string): Insert<'shoot_items'> {
  const source = group.items[0]!
  return {
    shoot_id: shoot.value.id,
    person_id,
    kind: source.kind,
    hook_template_id: source.kind === 'hook' ? source.template_id : null,
    body_template_id: source.kind === 'body' ? source.template_id : null,
    cta_template_id: source.kind === 'cta' ? source.template_id : null,
    code: group.code,
    channel_id,
    cta_mode: source.cta_mode,
    location: source.location,
    script_snapshot: source.script_snapshot as Json,
    caption: source.caption ?? null,
    sort_order: source.sort_order
  }
}

async function addItems(picked: PickedItems) {
  if (!bundle.value.people.length) return
  const codes = groups.value.map(group => group.code)
  let order = Math.max(0, ...bundle.value.items.map(item => item.sort_order))
  const take = (prefix: string) => {
    const next = nextItemCodes(codes, prefix, 1)[0]!
    codes.push(next)
    return next
  }

  // one entry per template, then one item per person (only the writer, for their own VOs)
  const entries: (Omit<Insert<'shoot_items'>, 'shoot_id' | 'person_id'> & { writer_id?: string | null })[] = []
  for (const hook of picked.hooks.filter(hook => !existingTemplates.value.includes(hook.id))) entries.push({
    kind: 'hook',
    hook_template_id: hook.id,
    code: take(itemPrefix('hook')),
    script_snapshot: hook.script,
    caption: hook.caption,
    sort_order: ++order
  })
  for (const body of picked.bodies.filter(body => !existingTemplates.value.includes(body.id))) {
    entries.push({ kind: 'body', body_template_id: body.id, code: take('V'), script_snapshot: body.beats, sort_order: ++order, writer_id: body.person_id })
  }
  for (const cta of picked.ctas.filter(cta => !existingTemplates.value.includes(cta.id))) {
    entries.push({ kind: 'cta', cta_template_id: cta.id, code: take('C'), cta_mode: cta.mode, script_snapshot: cta.script, sort_order: ++order })
  }
  if (!entries.length) return

  // one item per person per channel they're linked to (only the writer, for their own VOs)
  const rows = bundle.value.people.flatMap(person => entries
    .filter(entry => !entry.writer_id || entry.writer_id === person.id)
    .flatMap(({ writer_id: _writer, ...entry }) => channelsFor(bundle.value, person.id)
      .map(channel => ({ ...entry, shoot_id: shoot.value.id, person_id: person.id, channel_id: channel.id }) as Insert<'shoot_items'>)))
  await run(async () => {
    must(await db.from('shoot_items').insert(rows))
    await refresh()
  }, `Added ${entries.length} item${entries.length === 1 ? '' : 's'} to the structure`)
}

/** Shared fields (channel, location) apply to everyone's item. */
/** Shared by everyone filming a group: channel, location, or (edit for everyone) the shoot's own copy of the script. */
async function updateGroup(group: ShotGroup, patch: { channel_id?: string | null, location?: string | null, script_snapshot?: string | Beat[] }) {
  await run(async () => {
    must(await db.from('shoot_items').update(patch as Update<'shoot_items'>).in('id', group.items.map(item => item.id)))
    for (const item of group.items) Object.assign(item, patch)
  })
}

/** One person's own wording (override). */
async function updateItem(item: BundleItem, patch: { channel_id?: string | null, location?: string | null, script_override?: string | Beat[] | null, script_snapshot?: string | Beat[] }) {
  await run(async () => {
    must(await db.from('shoot_items').update(patch as Update<'shoot_items'>).eq('id', item.id))
    Object.assign(item, patch)
  })
}

async function removeGroup(group: ShotGroup) {
  await run(async () => {
    must(await db.from('shoot_items').delete().in('id', group.items.map(item => item.id)))
    await refresh()
  })
}

async function renumber() {
  await run(async () => {
    must(await db.rpc('renumber_shoot_items', { p_shoot_id: shoot.value.id }))
    await refresh()
  }, 'Codes re-numbered')
}

const sectionItems = [
  { value: 'hook', label: 'Hooks', icon: 'i-lucide-anchor' },
  { value: 'body', label: 'VOs', icon: 'i-lucide-mic' },
  { value: 'cta', label: 'CTAs', icon: 'i-lucide-megaphone' }
]
// all panels start collapsed
const openSections = ref<string[]>([])

// VOs grouped by format inside the structure (collapsed to start)
const openFormats = ref<Set<string>>(new Set())
function toggleFormat(id: string) {
  const next = new Set(openFormats.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openFormats.value = next
}
const vosOfFormat = (formatId: string) => groupsOf('body').filter(group => group.items[0]?.format?.id === formatId)

/** The picker opens on everything, or on one format's VOs. */
const pickerFormat = ref<BrollFormat | null>(null)
function openPicker(format: BrollFormat | null = null) {
  pickerFormat.value = format
  pickerOpen.value = true
}

/** Every person's copy of each format's VOs, so removing a format can take them off the structure. */
const voItemIds = computed(() => {
  const ids: Record<string, string[]> = {}
  for (const item of bundle.value.items) if (item.kind === 'body' && item.format?.id) (ids[item.format.id] ??= []).push(item.id)
  return ids
})

/** b-roll shots per format, for the remove-format confirmation */
// --- clearing sections -------------------------------------------------------
// Every Clear asks first, through one shared dialog, and lists what will go.
const confirmClear = ref<{ title: string, lines: string[], action: () => Promise<void> } | null>(null)
const clearing = ref(false)

async function deleteIds(table: 'shoot_items' | 'broll_shots', ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) must(await db.from(table).delete().in('id', ids.slice(i, i + 200)))
}
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const KIND_WORDS: Record<string, string> = { hook: 'hook', body: 'VO', cta: 'CTA' }

function clearStructure(kind: 'hook' | 'body' | 'cta' | null) {
  const targets = kind ? groupsOf(kind) : groups.value
  if (!targets.length) return
  const ids = targets.flatMap(group => group.items.map(item => item.id))
  confirmClear.value = {
    title: kind ? `Clear all ${KIND_WORDS[kind]}s?` : 'Clear the whole structure?',
    lines: [
      kind
        ? `${plural(targets.length, KIND_WORDS[kind]!)} come off the structure for everyone.`
        : `${plural(groupsOf('hook').length, 'hook')}, ${plural(groupsOf('body').length, 'VO')} and ${plural(groupsOf('cta').length, 'CTA')} come off the structure for everyone.`,
      'Per-person versions, locations and ticks on those items go too.'
    ],
    action: () => deleteIds('shoot_items', ids)
  }
}

function clearFormats() {
  const vos = groupsOf('body')
  const formatShots = bundle.value.broll.filter(shot => shot.format_id)
  confirmClear.value = {
    title: 'Clear all formats?',
    lines: [
      `${plural(shootFormats.value.length, 'format')} come off the plan.`,
      ...(vos.length ? [`All ${plural(vos.length, 'VO')} come off the structure for everyone.`] : []),
      ...(formatShots.length ? [`${plural(formatShots.length, 'b-roll shot')} in their sections go too. General product shots stay.`] : [])
    ],
    action: async () => {
      await deleteIds('shoot_items', vos.flatMap(group => group.items.map(item => item.id)))
      await deleteIds('broll_shots', formatShots.map(shot => shot.id))
      must(await db.from('shoot_formats').delete().eq('shoot_id', shoot.value.id))
    }
  }
}

function clearBroll() {
  const shots = bundle.value.broll
  if (!shots.length) return
  confirmClear.value = {
    title: 'Clear all b-roll?',
    lines: [`${plural(shots.length, 'b-roll shot')} go, including general product shots.`, 'Formats and their sections stay.'],
    action: () => deleteIds('broll_shots', shots.map(shot => shot.id))
  }
}

async function runClear() {
  const pending = confirmClear.value
  if (!pending) return
  clearing.value = true
  await run(async () => {
    await pending.action()
    await refresh()
  }, 'Cleared')
  clearing.value = false
  confirmClear.value = null
}

const clearStructureItems = computed(() => [
  [
    { label: 'Clear hooks', icon: 'i-lucide-anchor', disabled: !groupsOf('hook').length, onSelect: () => clearStructure('hook') },
    { label: 'Clear VOs', icon: 'i-lucide-mic', disabled: !groupsOf('body').length, onSelect: () => clearStructure('body') },
    { label: 'Clear CTAs', icon: 'i-lucide-megaphone', disabled: !groupsOf('cta').length, onSelect: () => clearStructure('cta') }
  ],
  [{ label: 'Clear everything', icon: 'i-lucide-trash-2', color: 'error' as const, disabled: !groups.value.length, onSelect: () => clearStructure(null) }]
])

const brollCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const shot of bundle.value.broll) if (shot.format_id) counts[shot.format_id] = (counts[shot.format_id] ?? 0) + 1
  return counts
})
/**
 * Formats on the plan, each with a b-roll section: the ones added by hand plus every format
 * the shoot's VOs use. Removing a format takes its VOs off the structure.
 */
const shootFormats = computed<BrollFormat[]>(() => {
  const formats = new Map<string, BrollFormat>()
  for (const format of bundle.value.plannedFormats) {
    formats.set(format.id, { ...format, usedBy: [], planned: true })
  }
  for (const group of groupShotList(bundle.value.items).filter(group => group.kind === 'body')) {
    const format = group.items[0]!.format
    if (!format?.id) continue
    const entry = formats.get(format.id) ?? {
      id: format.id,
      code: format.code,
      name: format.name ?? format.code,
      description: format.description ?? null,
      beats: format.beats,
      beat_descriptions: format.beat_descriptions ?? null,
      beat_broll: format.beat_broll ?? null,
      usedBy: [],
      planned: false
    }
    entry.usedBy.push(group.code)
    formats.set(format.id, entry)
  }
  return [...formats.values()].sort((a, b) => a.code.localeCompare(b.code))
})

// --- calculator ------------------------------------------------------------
const result = computed(() => calculate(bundleToCalcInput(bundle.value, toCalcSettings(settings.value, DEFAULT_CALC_SETTINGS))))
const unfilled = computed(() => unfilledItems(bundle.value))
const calculatorOpen = ref(false)

// --- status ----------------------------------------------------------------
const blockers = computed(() => {
  const list: string[] = []
  if (!shoot.value.shoot_date) list.push('Set a shoot date')
  if (!bundle.value.people.length) list.push('Add at least one person')
  if (!bundle.value.channels.length) list.push('Add at least one channel')
  if (!bundle.value.items.length) list.push('Add items from the Library')
  const unlinked = bundle.value.people.filter(person => !channelsFor(bundle.value, person.id).length)
  if (unlinked.length) {
    list.push(`${unlinked.map(person => person.name).join(', ')} ${unlinked.length === 1 ? 'isn\'t' : 'aren\'t'} linked to any of this shoot's channels (Settings → People)`)
  }
  if (unfilled.value.length) {
    list.push(`Fill or override the unfilled slots in ${unfilled.value.slice(0, 6).map(entry => entry.code).join(', ')}${unfilled.value.length > 6 ? '…' : ''}`)
  }
  return list
})

// --- back to draft -------------------------------------------------------------
// Only from planned (before the shoot starts): once filming begins, footage may already be
// filed under these codes, so started or filmed shoots stay locked.
// Revert: a shoot that's started (or ended) goes back to planned as if it never started, so it
// can then go back to draft. Ticks, b-roll counts and clip records are cleared; phones drop the
// clips they saved; anything already uploaded to Dropbox stays there.
const confirmRevert = ref(false)
async function revertShoot() {
  busy.value = true
  const ok = await run(async () => {
    must(await db.rpc('revert_shoot', { p_shoot_id: shoot.value.id }))
    // and forget which clips were on whose phone (the phones drop the clips themselves)
    must(await db.from('shoot_clips').delete().eq('shoot_id', shoot.value.id))
    await refresh()
  }, 'Shoot reverted. It\'s planned again, as if it never started.')
  busy.value = false
  if (ok) confirmRevert.value = false
}

const confirmUnplan = ref(false)
async function backToDraft() {
  busy.value = true
  const ok = await run(async () => {
    must(await db.from('shoots').update({ status: 'draft' }).eq('id', shoot.value.id).eq('status', 'planned'))
    await refresh()
  }, 'Back to draft. The plan can be edited again.')
  busy.value = false
  if (ok) confirmUnplan.value = false
}

const confirmPlan = ref(false)

// The shoot's whole folder tree in Dropbox (raw/, edited/, renders/ and shootsheet.json), made
// once it's planned and again before uploads. Folders already there are left as they are.
const dropbox = useDropbox()
const buildingTree = ref(false)
async function createDropboxFolders(quiet = false) {
  const status = await dropbox.ensure()
  if (!status?.connected) {
    if (!quiet) toast.add({ title: 'Dropbox isn\'t connected', description: 'An admin can connect it in Settings → Dropbox.', color: 'warning', icon: 'i-lucide-cloud-off' })
    return
  }
  buildingTree.value = true
  try {
    const result = await $fetch('/api/dropbox/tree', { method: 'POST', body: { shootCode: shoot.value.code } })
    toast.add({
      title: result.created ? `Created ${result.created} folder${result.created === 1 ? '' : 's'} in Dropbox` : 'Dropbox folders are up to date',
      description: result.failed ? `${result.failed} couldn't be created. Try again.` : result.root,
      color: result.failed ? 'warning' : 'success',
      icon: 'i-simple-icons-dropbox'
    })
  } catch (error) {
    toast.add({
      title: 'Couldn\'t create the Dropbox folders',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Try again from Export → Create folders in Dropbox.',
      color: 'error',
      icon: 'i-lucide-cloud-alert'
    })
  } finally {
    buildingTree.value = false
  }
}

async function markPlanned() {
  if (blockers.value.length) return
  busy.value = true
  const planned = await run(async () => {
    // Freeze the filled scripts into the snapshots so later template or product edits can't change this shoot.
    const frozen = planSnapshots(bundle.value)
    for (let i = 0; i < frozen.length; i += 20) {
      const results = await Promise.all(frozen.slice(i, i + 20).map(entry =>
        db.from('shoot_items').update({
          script_snapshot: entry.script_snapshot as unknown as Json,
          script_override: entry.script_override as unknown as Json,
          caption: entry.caption
        }).eq('id', entry.id)
      ))
      results.forEach(must)
    }
    must(await db.from('shoots').update({ status: 'planned' }).eq('id', shoot.value.id))
    await refresh()
  }, 'Shoot planned. Exports are ready.')
  busy.value = false
  confirmPlan.value = false
  if (planned) createDropboxFolders(true)
}

/** Shots still to film: items and b-roll that are neither filmed nor skipped. */
const remaining = computed(() =>
  [...bundle.value.items, ...bundle.value.broll].filter(entry => entry.status === 'planned').length
)
const { nameOf } = useUsers()
const timeOf = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function download(format: string) {
  if (unfilled.value.length) {
    toast.add({ title: 'Unfilled slots block exports', description: unfilled.value.map(entry => entry.code).join(', '), color: 'error' })
    return
  }
  window.location.assign(`/api/shoots/${shoot.value.code}/export?format=${format}`)
}

const exportItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'shootsheet.json', icon: 'i-lucide-braces', onSelect: () => download('json') },
    { label: 'CSV', icon: 'i-lucide-table', onSelect: () => download('csv') },
    { label: 'Folder skeleton (zip)', icon: 'i-lucide-folder-archive', onSelect: () => download('zip') }
  ],
  [
    {
      label: buildingTree.value ? 'Creating folders…' : 'Create folders in Dropbox',
      description: 'Only adds what\'s missing',
      icon: 'i-simple-icons-dropbox',
      disabled: buildingTree.value,
      onSelect: () => createDropboxFolders()
    }
  ]
])
</script>

<template>
  <UDashboardPanel id="shoot">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/shoots" aria-label="Back to shoots" />
        </template>
        <template #title>
          <span class="font-mono">{{ shoot.code }}</span>
          <span class="hidden font-normal text-muted sm:inline"> · {{ bundle.brand.name }} — {{ bundle.product.name }}</span>
        </template>
        <template #trailing>
          <UBadge :label="shoot.status" :color="SHOOT_STATUS_COLORS[shoot.status]" variant="subtle" class="capitalize" />
        </template>
        <template #right>
          <template v-if="isDraft">
            <UButton
              label="Re-number"
              icon="i-lucide-list-ordered"
              color="neutral"
              variant="ghost"
              class="hidden sm:inline-flex"
              @click="renumber"
            />
            <UButton
              label="Mark as planned"
              aria-label="Mark as planned"
              :ui="ICON_ON_MOBILE"
              class="max-sm:px-1.5"
              icon="i-lucide-lock"
              :disabled="blockers.length > 0"
              :loading="busy"
              @click="confirmPlan = true"
            />
          </template>
          <template v-else>
            <UButton
              label="Checklist"
              aria-label="Checklist"
              :ui="ICON_ON_MOBILE"
              class="max-sm:px-1.5"
              icon="i-lucide-clipboard-check"
              :color="shoot.status === 'shooting' ? 'primary' : 'neutral'"
              :variant="shoot.status === 'shooting' ? 'solid' : 'subtle'"
              :to="`/shoots/${shoot.code}/sheet`"
            />
            <UDropdownMenu :items="exportItems">
              <UButton label="Export" aria-label="Export" icon="i-lucide-download" color="neutral" variant="subtle" :ui="ICON_ON_MOBILE" class="max-sm:px-1.5" />
            </UDropdownMenu>
            <UButton
              v-if="shoot.status === 'planned'"
              label="Back to draft"
              aria-label="Back to draft"
              :ui="ICON_ON_MOBILE"
              class="max-sm:px-1.5"
              icon="i-lucide-lock-open"
              color="neutral"
              variant="ghost"
              @click="confirmUnplan = true"
            />
            <UButton
              v-if="shoot.status === 'shooting' || shoot.status === 'filmed'"
              label="Revert"
              aria-label="Revert the shoot to planned"
              :ui="ICON_ON_MOBILE"
              class="max-sm:px-1.5"
              icon="i-lucide-history"
              color="neutral"
              variant="ghost"
              @click="confirmRevert = true"
            />
            <ShootControls :shoot="shoot" :remaining="remaining" icon-on-mobile @changed="refresh" />
          </template>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0">
        <div class="min-w-0 space-y-6">
          <UAlert
            v-if="isDraft && blockers.length"
            color="neutral"
            variant="subtle"
            icon="i-lucide-list-checks"
            title="Before this shoot can be planned"
          >
            <template #description>
              <ul class="list-disc pl-4">
                <li v-for="blocker in blockers" :key="blocker">
                  {{ blocker }}
                </li>
              </ul>
            </template>
          </UAlert>
          <UAlert
            v-else-if="!isDraft"
            color="info"
            variant="subtle"
            icon="i-lucide-lock"
            title="Codes and scripts are frozen"
            :description="shoot.status === 'planned' ? 'Library and product edits no longer affect this shoot. You can still add per-person wording, locations and b-roll shots, or use Back to draft to change the plan.' : 'Library and product edits no longer affect this shoot. You can still add per-person wording, locations and b-roll shots.'"
          />
          <!-- slots nothing fills yet: fill them here (drafts only; planning freezes the scripts) -->
          <PlannerSlotFiller v-if="isDraft" :bundle="bundle" @changed="refresh" />
          <UAlert
            v-if="shoot.started_at"
            :color="shoot.status === 'shooting' ? 'warning' : 'success'"
            variant="subtle"
            :icon="shoot.status === 'shooting' ? 'i-lucide-clapperboard' : 'i-lucide-check-check'"
          >
            <template #title>
              <span class="flex flex-wrap items-center gap-x-2">
                {{ shoot.status === 'shooting' ? 'Shoot in progress' : 'Shoot finished' }}
                <ShootElapsed :shoot="shoot" />
              </span>
            </template>
            <template #description>
              <p>Started {{ timeOf(shoot.started_at) }} by {{ nameOf(shoot.started_by) }}.</p>
              <p v-if="shoot.ended_at">
                Ended {{ timeOf(shoot.ended_at) }} by {{ nameOf(shoot.ended_by) }}.
              </p>
              <p>{{ remaining }} shot{{ remaining === 1 ? '' : 's' }} left to tick off.</p>
            </template>
          </UAlert>

          <!-- 1. Setup -->
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 class="font-semibold text-highlighted">
                  Setup
                </h2>
                <CreatedBy :by="shoot.created_by" :at="shoot.created_at" />
              </div>
            </template>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Product">
                <USelectMenu
                  v-model="form.product_id"
                  :items="productOptions"
                  value-key="value"
                  class="w-full"
                  :disabled="!isDraft"
                  @update:model-value="saveSetup"
                />
              </UFormField>
              <UFormField label="Shoot date">
                <UInput v-model="form.shoot_date" type="date" class="w-full" :disabled="!isDraft" @change="saveSetup" />
              </UFormField>
              <UFormField label="People">
                <USelectMenu
                  :model-value="personIds"
                  :items="peopleOptions"
                  value-key="value"
                  multiple
                  placeholder="Add people"
                  class="w-full"
                  :disabled="!isDraft"
                  @update:model-value="setPeople"
                />
              </UFormField>
              <UFormField label="Channels" help="Defaults to the brand's channels">
                <USelectMenu
                  :model-value="channelIds"
                  :items="channelOptions"
                  value-key="value"
                  multiple
                  placeholder="Add channels"
                  class="w-full"
                  :disabled="!isDraft"
                  @update:model-value="setChannels"
                />
              </UFormField>
              <UFormField label="Batch size" help="The share of this shoot's valid recipes each batch submits.">
                <UInput v-model.number="form.submission_pct" type="number" min="0" max="100" step="0.5" class="w-full" @change="saveSetup">
                  <template #trailing>
                    <span class="text-xs text-muted">%</span>
                  </template>
                </UInput>
              </UFormField>
              <UFormField label="Target per channel" help="Submissions per channel per month. The calculator shows each channel's runway (months of supply) against it.">
                <UInput v-model.number="form.runway_target" type="number" min="1" class="w-full" @change="saveSetup">
                  <template #trailing>
                    <span class="text-xs text-muted">/ month</span>
                  </template>
                </UInput>
              </UFormField>
              <UFormField label="Kit" help="Just a tag for this shoot (e.g. Audition = trial shoot for a new brand, Scale = full production). It doesn't change anything else.">
                <USelect v-model="form.kit" :items="kits" class="w-full" @update:model-value="saveSetup" />
              </UFormField>
              <UFormField label="Location notes">
                <UInput v-model="form.location_notes" class="w-full" @change="saveSetup" />
              </UFormField>
              <UFormField label="Notes" class="sm:col-span-2">
                <UTextarea v-model="form.notes" autoresize :rows="2" class="w-full" @change="saveSetup" />
              </UFormField>
            </div>
          </UCard>

          <!-- 2. Formats -->
          <UCard>
            <template #header>
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h2 class="font-semibold text-highlighted">
                    Formats
                  </h2>
                  <p class="text-sm text-muted">
                    The VO formats this shoot uses. Formats of the VOs you add are included automatically, and removing a format takes its VOs with it.
                  </p>
                </div>
                <UButton
                  v-if="isDraft && shootFormats.length"
                  label="Clear"
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="clearFormats"
                />
              </div>
            </template>
            <PlannerFormats
              :shoot-id="shoot.id"
              :formats="shootFormats"
              :broll-counts="brollCounts"
              :vo-item-ids="voItemIds"
              :draft="isDraft"
              @changed="refresh"
            />
          </UCard>

          <!-- 3. Structure: everyone films every item -->
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 class="font-semibold text-highlighted">
                    Structure
                  </h2>
                  <p class="text-xs text-muted">
                    {{ groupsOf('hook').length }} hooks · {{ groupsOf('body').length }} VOs · {{ groupsOf('cta').length }} CTAs,
                    filmed by everyone<template v-if="bundle.people.length">
                      ({{ bundle.people.map(person => person.name).join(', ') }})
                    </template>
                  </p>
                </div>
                <div v-if="isDraft" class="flex items-center gap-1">
                  <UDropdownMenu v-if="groups.length" :items="clearStructureItems">
                    <UButton label="Clear" icon="i-lucide-trash-2" trailing-icon="i-lucide-chevron-down" size="xs" color="neutral" variant="ghost" />
                  </UDropdownMenu>
                  <UButton
                    label="Add from Library"
                    icon="i-lucide-plus"
                    size="sm"
                    :disabled="!bundle.people.length"
                    @click="openPicker()"
                  />
                </div>
              </div>
            </template>

            <p v-if="!bundle.people.length" class="px-4 py-8 text-center text-sm text-muted">
              Add people in Setup first, then pick hooks, VOs and CTAs from the Library. Everyone films every item.
            </p>

            <!-- Hooks, Formats & VOs, CTAs: collapsible, collapsed to start -->
            <UAccordion
              v-else
              v-model="openSections"
              type="multiple"
              :items="sectionItems"
              :unmount-on-hide="false"
              :ui="{
                item: 'border-b border-default last:border-b-0',
                trigger: 'px-4 py-3 bg-elevated/40',
                content: 'divide-y divide-default border-t border-default'
              }"
            >
              <template #default="{ item }">
                <span class="font-semibold text-highlighted">{{ item.label }}</span>
                <span class="ml-auto pl-3 text-xs font-normal text-muted tabular-nums">{{ groupsOf(item.value).length }}</span>
              </template>
              <template #content="{ item }">
                <!-- VOs, grouped by format like the Library's Formats & VOs -->
                <template v-if="item.value === 'body'">
                  <div v-for="format in shootFormats" :key="format.id">
                    <div class="flex items-center gap-3 bg-elevated/20 px-4 py-2.5">
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-2 text-left"
                        :aria-expanded="openFormats.has(format.id)"
                        @click="toggleFormat(format.id)"
                      >
                        <UIcon
                          name="i-lucide-chevron-right"
                          class="size-4 shrink-0 text-muted transition-transform"
                          :class="{ 'rotate-90': openFormats.has(format.id) }"
                        />
                        <span class="truncate text-sm text-highlighted">
                          <span class="mr-1.5 font-mono font-semibold">{{ format.code }}</span>{{ format.name }}
                        </span>
                        <UBadge :label="`${vosOfFormat(format.id).length} VO${vosOfFormat(format.id).length === 1 ? '' : 's'}`" color="neutral" variant="outline" size="sm" class="shrink-0" />
                      </button>
                      <UButton
                        v-if="isDraft"
                        :label="`Add ${format.code} VOs`"
                        icon="i-lucide-plus"
                        size="xs"
                        color="neutral"
                        variant="subtle"
                        @click="openPicker(format)"
                      />
                    </div>
                    <div v-if="openFormats.has(format.id)" class="divide-y divide-default border-t border-default">
                      <PlannerShotRow
                        v-for="group in vosOfFormat(format.id)"
                        :key="group.key"
                        :group="group"
                        :bundle="bundle"
                        :draft="isDraft"
                        :product-id="shoot.product_id"
                        @update-group="updateGroup(group, $event)"
                        @update-item="updateItem"
                        @remove="removeGroup(group)"
                      />
                      <p v-if="!vosOfFormat(format.id).length" class="px-4 py-3 text-xs text-dimmed">
                        No {{ format.code }} VOs yet.
                      </p>
                    </div>
                  </div>
                  <p v-if="!shootFormats.length" class="px-4 py-3 text-xs text-dimmed">
                    Add a format in the Formats section, or add VOs from the Library.
                  </p>
                </template>

                <template v-else>
                  <PlannerShotRow
                    v-for="group in groupsOf(item.value)"
                    :key="group.key"
                    :group="group"
                    :bundle="bundle"
                    :draft="isDraft"
                    :product-id="shoot.product_id"
                    @update-group="updateGroup(group, $event)"
                    @update-item="updateItem"
                    @remove="removeGroup(group)"
                  />
                  <p v-if="!groupsOf(item.value).length" class="px-4 py-3 text-xs text-dimmed">
                    No {{ item.label }} yet.
                  </p>
                </template>
              </template>
            </UAccordion>
          </UCard>

          <!-- 4. B-roll -->
          <UCard>
            <template #header>
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h2 class="font-semibold text-highlighted">
                    B-roll
                  </h2>
                  <p class="text-sm text-muted">
                    A section for each format, by beat, plus general product shots. Shared by every channel.
                  </p>
                </div>
                <UButton
                  v-if="isDraft && bundle.broll.length"
                  label="Clear"
                  icon="i-lucide-trash-2"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="clearBroll"
                />
              </div>
            </template>
            <PlannerBroll
              :shoot-id="shoot.id"
              :shoot-code="shoot.code"
              :shots="bundle.broll"
              :formats="shootFormats"
              :draft="isDraft"
              @changed="refresh"
            />
          </UCard>        </div>

        <!-- Calculator: sticky on desktop -->
        <aside class="hidden lg:block">
          <div class="sticky top-0 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain rounded-lg border border-default p-4">
            <h2 class="mb-3 font-semibold text-highlighted">
              Calculator
            </h2>
            <PlannerCalculator :result="result" :submission-rate="Number(shoot.submission_rate)" :target="shoot.runway_target" :unfilled="unfilled" />
          </div>
        </aside>
      </div>

      <!-- Calculator: bottom sheet on mobile -->
      <div class="fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default p-3 lg:hidden">
        <UButton block color="neutral" variant="subtle" icon="i-lucide-calculator" @click="calculatorOpen = true">
          {{ formatNumber(result.totals.recipes) }} recipes · {{ formatNumber(result.totals.submissions) }} submissions
        </UButton>
      </div>
      <UDrawer v-model:open="calculatorOpen" title="Calculator" :ui="{ content: 'max-h-[85dvh]', body: 'overflow-y-auto' }">
        <template #body>
          <PlannerCalculator :result="result" :submission-rate="Number(shoot.submission_rate)" :target="shoot.runway_target" :unfilled="unfilled" />
        </template>
      </UDrawer>

      <UModal v-model:open="confirmPlan" :title="`Mark ${shoot.code} as planned?`">
        <template #body>
          <ul class="list-disc space-y-1 pl-5 text-sm text-default">
            <li>Codes are fixed and scripts are frozen with their slots filled in, so later Library or product edits won't change this shoot.</li>
            <li>The checklist, exports and folder skeleton become available.</li>
            <li>You can put it back to draft until the shoot starts.</li>
          </ul>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
            <UButton label="Mark as planned" icon="i-lucide-lock" :loading="busy" @click="markPlanned" />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="confirmRevert" :title="`Revert ${shoot.code} to planned?`">
        <template #body>
          <div class="space-y-2 text-sm text-default">
            <p>The shoot goes back to planned, as if it never started. You can then put it back to draft.</p>
            <ul class="list-disc space-y-0.5 pl-4 text-muted">
              <li>Every tick and skip is cleared, and b-roll counts go back to zero.</li>
              <li>Clips saved on phones are discarded and won't upload.</li>
              <li>Anything already uploaded to Dropbox stays there.</li>
            </ul>
          </div>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
            <UButton label="Revert shoot" icon="i-lucide-history" color="error" :loading="busy" @click="revertShoot" />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="confirmUnplan" :title="`Put ${shoot.code} back to draft?`">
        <template #body>
          <ul class="list-disc space-y-1 pl-5 text-sm text-default">
            <li>You can add and remove people, formats, hooks, VOs, CTAs and b-roll again, and re-number codes.</li>
            <li>Scripts already filled in keep their wording. You can still edit them per person.</li>
            <li>If you change codes, download the exports and folder skeleton again after re-planning.</li>
          </ul>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
            <UButton label="Back to draft" icon="i-lucide-lock-open" :loading="busy" @click="backToDraft" />
          </div>
        </template>
      </UModal>

      <UModal :open="!!confirmClear" :title="confirmClear?.title" @update:open="confirmClear = $event ? confirmClear : null">
        <template #body>
          <ul class="list-disc space-y-1 pl-5 text-sm text-default">
            <li v-for="line in confirmClear?.lines ?? []" :key="line">
              {{ line }}
            </li>
          </ul>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
            <UButton label="Clear" color="error" icon="i-lucide-trash-2" :loading="clearing" @click="runClear" />
          </div>
        </template>
      </UModal>

      <PlannerItemPicker
        v-model:open="pickerOpen"
        :existing="existingTemplates"
        :format="pickerFormat"
        :product-id="shoot.product_id"
        :people-ids="personIds"
        @add="addItems"
      />
    </template>
  </UDashboardPanel>
</template>
