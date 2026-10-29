<script setup lang="ts">
import type { AccordionItem, DropdownMenuItem } from '@nuxt/ui'
import type { Row, Update } from '#shared/types/models'
import type { BrollShot } from '#shared/utils/loadShoot'

// B-roll shot list: one collapsible panel per format on the plan (managed in the Formats section), with its
// description), a section per beat (with what the beat is for), then general product
// shots. Shared by every channel. Panels start collapsed. A shot can be for one product feature:
// its clips go in b-roll/<beat>/<feature>/ and only under VOs about that feature; otherwise it's
// generic b-roll for its beat. The feature is set while the shoot is a draft (it names the folder).
export interface BrollFormat {
  id: string
  code: string
  name: string
  description: string | null
  beats: string[]
  beat_descriptions: Record<string, string> | null
  /** beat -> suggested b-roll shots, written on the format */
  beat_broll: unknown
  /** VO codes on the shot list that use this format (it can't be removed while there are any) */
  usedBy: string[]
  /** added to the plan by hand */
  planned: boolean
}

const props = defineProps<{
  shootId: string
  shootCode: string
  /** the shoot's product: its features are what b-roll can be tied to */
  productId: string
  shots: BrollShot[]
  formats: BrollFormat[]
  draft: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const db = useDb()
const run = useAction()
const { settings, featureOptions } = useRefData()
const features = computed(() => featureOptions(props.productId))
export interface BrollSection extends AccordionItem {
  value: string
  label: string
  description: string
  formatId: string | null
  beats: string[]
  beatDescriptions: Record<string, string>
  /** beat -> suggested shots (from the format, or Settings for general product shots) */
  suggestions: Record<string, BrollSuggestion[]>
}

const formatIds = computed(() => props.formats.map(format => format.id))
/** Shots in the general section: no format, or a format no VO on the shoot uses any more. */
const isGeneral = (shot: Row<'broll_shots'>) => !shot.format_id || !formatIds.value.includes(shot.format_id)

const sections = computed<BrollSection[]>(() => {
  const generalBeats = [...new Set(['product', ...props.shots.filter(isGeneral).map(shot => shot.beat)])]
  return [
    ...props.formats.map(format => ({
      value: format.id,
      label: `${format.code} · ${format.name}`,
      description: format.description ?? '',
      formatId: format.id as string | null,
      beats: format.beats,
      beatDescriptions: format.beat_descriptions ?? {},
      suggestions: parseBeatSuggestions(format.beat_broll)
    })),
    {
      value: 'general',
      label: 'General product shots',
      description: 'Pack shots and product close-ups any VO can use.',
      formatId: null,
      beats: generalBeats,
      beatDescriptions: { product: 'Clean shots of the product on its own: packaging, label, texture, in hand.' },
      suggestions: { product: parseSuggestions(settings.value?.general_broll) }
    }
  ]
})
// all panels start collapsed
const open = ref<string[]>([])

const shotsFor = (section: BrollSection, beat: string) => props.shots.filter(shot =>
  shot.beat === beat && (section.formatId ? shot.format_id === section.formatId : isGeneral(shot)))
const sectionShots = (section: BrollSection) => section.beats.flatMap(beat => shotsFor(section, beat))
const count = (shots: Row<'broll_shots'>[]) => shots.filter(shot => shot.status !== 'skipped').length
const totalShots = computed(() => count(props.shots))

/** Suggestions are written by the team: on each format's beats, and in Settings for general product shots. */
const presetsFor = (section: BrollSection, beat: string) => section.suggestions[beat] ?? []
/** Suggestions for a beat that haven't been added yet. */
const suggestionsFor = (section: BrollSection, beat: string) => {
  const existing = shotsFor(section, beat).map(shot => shot.description)
  return presetsFor(section, beat).filter(preset => !existing.includes(preset.description))
}

const nextOrder = () => Math.max(0, ...props.shots.map(shot => shot.sort_order)) + 1

async function add(section: BrollSection, beat: string, preset?: BrollSuggestion) {
  await run(async () => {
    must(await db.from('broll_shots').insert({
      shoot_id: props.shootId,
      channel_id: null,
      format_id: section.formatId,
      beat,
      description: preset?.description ?? '',
      sort_order: nextOrder()
    }))
    emit('changed')
  })
}

/** Suggestions not yet added, across every beat of a section. */
const sectionSuggestions = (section: BrollSection) =>
  section.beats.flatMap(beat => suggestionsFor(section, beat).map(suggestion => ({ beat, ...suggestion })))

async function addSectionSuggestions(section: BrollSection) {
  const missing = sectionSuggestions(section)
  if (!missing.length) return
  const start = nextOrder()
  await run(async () => {
    must(await db.from('broll_shots').insert(missing.map((suggestion, index) => ({
      shoot_id: props.shootId,
      channel_id: null,
      format_id: section.formatId,
      beat: suggestion.beat,
      description: suggestion.description,
      sort_order: start + index
    }))))
    emit('changed')
  }, `Added ${missing.length} suggested shot${missing.length === 1 ? '' : 's'}`)
}

async function addPresets(section: BrollSection, beat: string) {
  const missing = suggestionsFor(section, beat)
  if (!missing.length) return
  const start = nextOrder()
  await run(async () => {
    must(await db.from('broll_shots').insert(missing.map((preset, index) => ({
      shoot_id: props.shootId,
      channel_id: null,
      format_id: section.formatId,
      beat,
      description: preset.description,
      sort_order: start + index
    }))))
    emit('changed')
  })
}

/** A beat's Suggested dropdown: every suggestion not added yet, and all of them at once. */
function suggestionMenu(section: BrollSection, beat: string): DropdownMenuItem[][] {
  const missing = suggestionsFor(section, beat)
  return [
    missing.map(suggestion => ({ label: suggestion.description, icon: 'i-lucide-plus', onSelect: () => add(section, beat, suggestion) })),
    ...(missing.length > 1 ? [[{ label: `Add all ${missing.length}`, icon: 'i-lucide-wand', onSelect: () => addPresets(section, beat) }]] : [])
  ]
}

async function update(shot: Row<'broll_shots'>, patch: Update<'broll_shots'>) {
  await run(async () => {
    must(await db.from('broll_shots').update(patch).eq('id', shot.id))
    emit('changed')
  })
}

async function remove(shot: Row<'broll_shots'>) {
  await run(async () => {
    must(await db.from('broll_shots').delete().eq('id', shot.id))
    emit('changed')
  })
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-muted">
        {{ totalShots }} shot{{ totalShots === 1 ? '' : 's' }}, shared by every channel.<template v-if="totalShots">
          Each channel films as many clips of each as it likes.
        </template>
      </p>
      <PlannerBrollGenerator
        :shoot-id="props.shootId"
        :shoot-code="props.shootCode"
        :sections="sections"
        :next-order="nextOrder()"
        @added="emit('changed')"
      />
    </div>

    <UAlert
      v-if="!props.formats.length"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      description="Add a format in the Formats section, or add VOs to the structure, and a b-roll section appears for each format with its beats."
    />

    <UAccordion
      v-model="open"
      type="multiple"
      :items="sections"
      :unmount-on-hide="false"
      :ui="{
        root: 'space-y-3',
        item: 'overflow-hidden rounded-lg border border-default',
        header: 'bg-elevated/40',
        trigger: 'px-4 py-3',
        content: 'border-t border-default'
      }"
    >
      <template #default="{ item }">
        <span class="min-w-0 flex-1 text-left">
          <span class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-semibold text-highlighted">{{ item.label }}</span>
            <span class="text-xs font-normal text-muted tabular-nums">· {{ count(sectionShots(item as BrollSection)) }} shots</span>
          </span>
          <span v-if="item.description" class="block text-sm font-normal text-muted">{{ item.description }}</span>
        </span>
      </template>

      <template #content="{ item }">
        <!-- the whole section's suggestions in one go -->
        <div
          v-if="sectionSuggestions(item as BrollSection).length"
          class="flex flex-wrap items-center justify-between gap-2 border-b border-default bg-elevated/20 px-4 py-2"
        >
          <span class="text-xs text-muted">
            {{ sectionSuggestions(item as BrollSection).length }} suggested shot{{ sectionSuggestions(item as BrollSection).length === 1 ? '' : 's' }} not added yet
          </span>
          <UButton
            :label="`Add all suggestions${(item as BrollSection).formatId ? ` for ${(item as BrollSection).label.split(' · ')[0]}` : ''}`"
            icon="i-lucide-wand"
            size="xs"
            color="neutral"
            variant="subtle"
            @click="addSectionSuggestions(item as BrollSection)"
          />
        </div>
        <div
          v-for="beat in (item as BrollSection).beats"
          :key="beat"
          class="border-b border-default px-4 py-3 last:border-b-0"
        >
          <div class="mb-1.5 flex items-center gap-2">
            <span class="text-xs font-semibold text-highlighted uppercase">{{ beat }}</span>
            <UPopover v-if="(item as BrollSection).beatDescriptions[beat]" :content="{ side: 'top', align: 'start' }">
              <button type="button" class="inline-flex text-dimmed hover:text-default" :aria-label="`What is the ${beat} beat?`">
                <UIcon name="i-lucide-circle-help" class="size-4" />
              </button>
              <template #content>
                <p class="max-w-xs p-3 text-sm text-default">
                  {{ (item as BrollSection).beatDescriptions[beat] }}
                </p>
              </template>
            </UPopover>
            <div class="ml-auto flex gap-1">
              <!-- the beat's suggested shots, one tap each (or all at once), in a dropdown -->
              <UDropdownMenu
                v-if="suggestionsFor(item as BrollSection, beat).length"
                :items="suggestionMenu(item as BrollSection, beat)"
                :content="{ align: 'end' }"
                :ui="{ content: 'max-w-sm', itemLabel: 'whitespace-normal' }"
              >
                <UButton
                  :label="`Suggested (${suggestionsFor(item as BrollSection, beat).length})`"
                  icon="i-lucide-wand"
                  trailing-icon="i-lucide-chevron-down"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                />
              </UDropdownMenu>
              <UButton label="Custom shot" icon="i-lucide-plus" size="xs" color="neutral" variant="subtle" @click="add(item as BrollSection, beat)" />
            </div>
          </div>

          <p v-if="!presetsFor(item as BrollSection, beat).length" class="mb-2 text-xs text-dimmed">
            No suggested shots yet. Add them {{ (item as BrollSection).formatId ? 'to this beat on the format in Library → Formats' : 'in Settings → Defaults' }}.
          </p>

          <div class="space-y-1.5">
            <div v-for="shot in shotsFor(item as BrollSection, beat)" :key="shot.id" class="flex flex-wrap items-center gap-2">
              <UInput
                :model-value="shot.description"
                placeholder="Describe the shot"
                size="sm"
                class="min-w-48 flex-1"
                @change="update(shot, { description: ($event.target as HTMLInputElement).value })"
              />
              <USelectMenu
                v-if="features.length"
                :model-value="shot.feature_id ?? undefined"
                :items="features"
                value-key="value"
                placeholder="Generic"
                icon="i-lucide-sparkles"
                size="sm"
                class="w-48"
                :clear="!!shot.feature_id"
                :disabled="!props.draft"
                :title="props.draft ? 'Only goes under VOs about this feature; Generic goes under any VO' : 'Set while the shoot is a draft: it names the clips\' folder'"
                @update:model-value="update(shot, { feature_id: ($event as string | undefined) ?? null })"
              />
              <UBadge v-if="shot.status !== 'planned'" :label="shot.status" :color="ITEM_STATUS_COLORS[shot.status]" variant="subtle" size="sm" />
              <UButton
                v-if="props.draft"
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Remove shot"
                @click="remove(shot)"
              />
            </div>
            <p v-if="!shotsFor(item as BrollSection, beat).length" class="text-xs text-dimmed">
              No shots yet.
            </p>
          </div>
        </div>
      </template>
    </UAccordion>

  </div>
</template>
