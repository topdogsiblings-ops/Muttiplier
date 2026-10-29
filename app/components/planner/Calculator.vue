<script setup lang="ts">
import type { CalcResult } from '#shared/utils/calculator'

// Live calculator panel (spec §9). The math lives in shared/utils/calculator.ts.
const props = defineProps<{
  result: CalcResult
  submissionRate: number
  /** target submissions per channel per month (Setup), for runway */
  target: number
  unfilled: { code: string, slots: string[] }[]
}>()


const hours = (minutes: number) => `${formatNumber(minutes / 60, 1)}h`
const runway = (submissions: number) => {
  const months = monthsOfSupply(submissions, Number(props.target))
  return months === null ? '—' : `${formatNumber(months, 1)} mo`
}

// --- charts --------------------------------------------------------------------
const DONUT_RADIUS = 40
const DONUT_WIDTH = 12
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS
/** about a 2px surface gap between slices at the rendered size */
const SLICE_GAP = 1.6

/** Donut slices: colour by channel position (fixed slot order), sized by share of submissions. */
const donut = computed(() => {
  const total = props.result.totals.submissions
  const slices = props.result.perChannel.filter(channel => channel.submissions > 0).length
  let start = 0
  const segments = props.result.perChannel.map((channel, index) => {
    const length = total > 0 ? (channel.submissions / total) * CIRCUMFERENCE : 0
    const visible = slices > 1 ? Math.max(0, length - SLICE_GAP) : length
    const segment = {
      id: channel.id,
      name: channel.name,
      submissions: channel.submissions,
      recipes: channel.recipes,
      share: total > 0 ? Math.round((channel.submissions / total) * 100) : 0,
      color: `var(--chart-${(index % 8) + 1})`,
      length,
      dash: `${visible} ${CIRCUMFERENCE}`,
      offset: -start
    }
    start += length
    return segment
  })
  return { total, segments }
})
const maxMinutes = computed(() => Math.max(0, ...props.result.perPerson.map(person => person.onCameraMin + person.voMin)))
/** Bar length as a share of the longest bar; empty when there's nothing to compare. */
const barWidth = (value: number, max: number) => (max > 0 ? `${(value / max) * 100}%` : '0%')
/** Everyone films at once, so the person with the most on-camera time sets the shoot day. */
const longestOnCamera = computed(() => Math.max(0, ...props.result.perPerson.map(person => person.onCameraMin)))
const setsTheDay = (id: string) => props.result.perPerson.length > 1 && longestOnCamera.value > 0
  && props.result.perPerson.find(person => person.id === id)?.onCameraMin === longestOnCamera.value

const warnings = computed(() => [
  ...props.result.warnings,
  ...props.unfilled.map(entry => `${entry.code}: unfilled ${entry.slots.map(slot => `{{${slot}}}`).join(', ')}`)
])
/** warnings start collapsed: the count says there are some; open to read them */
const warningsOpen = ref(false)
</script>

<template>
  <div class="space-y-5 text-sm">
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-lg bg-elevated/60 p-3">
        <p class="text-xs text-muted">
          Recipes
        </p>
        <p class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ formatNumber(result.totals.recipes) }}
        </p>
      </div>
      <div class="rounded-lg bg-primary/10 p-3">
        <p class="text-xs text-muted">
          Est. submissions · {{ formatNumber(submissionRate * 100, 1) }}%
        </p>
        <p class="text-2xl font-semibold text-highlighted tabular-nums">
          {{ formatNumber(result.totals.submissions) }}
        </p>
      </div>
    </div>

    <dl class="grid grid-cols-3 gap-x-3 gap-y-2">
      <div>
        <dt class="text-xs text-muted">
          Clips to film
        </dt>
        <dd class="font-medium text-highlighted tabular-nums">
          {{ result.totals.clips }}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          On camera
        </dt>
        <dd class="font-medium text-highlighted tabular-nums">
          {{ formatNumber(result.totals.onCameraHours, 1) }}h
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          VO
        </dt>
        <dd class="font-medium text-highlighted tabular-nums">
          {{ formatNumber(result.totals.voHours, 1) }}h
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          <UTooltip text="Everyone films on their own phone at the same time, so this follows the person with the most on-camera time.">
            <span class="cursor-help underline decoration-dotted underline-offset-2">Shoot days</span>
          </UTooltip>
        </dt>
        <dd class="font-medium text-highlighted tabular-nums">
          {{ result.totals.shootDays }}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          Concepts
        </dt>
        <dd class="font-medium text-highlighted tabular-nums">
          {{ formatNumber(result.totals.concepts) }}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          B-roll shots
        </dt>
        <dd class="font-medium text-highlighted tabular-nums">
          {{ result.totals.brollShots }}
        </dd>
      </div>
    </dl>

    <UAlert
      v-if="warnings.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
    >
      <template #title>
        <button type="button" class="flex w-full items-center gap-1 text-left" :aria-expanded="warningsOpen" @click="warningsOpen = !warningsOpen">
          <span class="flex-1">{{ warnings.length }} warning{{ warnings.length === 1 ? '' : 's' }}</span>
          <UIcon :name="warningsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 shrink-0" />
        </button>
      </template>
      <template v-if="warningsOpen" #description>
        <ul class="list-disc space-y-0.5 pl-4">
          <li v-for="warning in warnings.slice(0, 8)" :key="warning">
            {{ warning }}
          </li>
          <li v-if="warnings.length > 8">
            …and {{ warnings.length - 8 }} more
          </li>
        </ul>
      </template>
    </UAlert>

    <!-- Chart: how estimated submissions split across channels (donut + legend table) -->
    <section>
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="text-xs font-medium text-muted uppercase">
          Submissions per channel
        </h3>
        <span class="text-xs text-muted">Runway at {{ formatNumber(props.target) }} / month</span>
      </div>

      <p v-if="!result.perChannel.length" class="text-muted">
        No channels on this shoot yet.
      </p>
      <template v-else>
        <div class="flex justify-center">
          <svg
            viewBox="0 0 100 100"
            class="size-36"
            role="img"
            :aria-label="`Estimated submissions per channel: ${donut.segments.map(segment => `${segment.name} ${segment.submissions}`).join(', ')}`"
          >
            <!-- track, so an all-zero shoot still reads as a ring -->
            <circle cx="50" cy="50" :r="DONUT_RADIUS" fill="none" stroke="var(--ui-border)" :stroke-width="DONUT_WIDTH" />
            <circle
              v-for="segment in donut.segments.filter(s => s.length > 0)"
              :key="segment.id"
              cx="50"
              cy="50"
              :r="DONUT_RADIUS"
              fill="none"
              :stroke="segment.color"
              :stroke-width="DONUT_WIDTH"
              :stroke-dasharray="segment.dash"
              :stroke-dashoffset="segment.offset"
              transform="rotate(-90 50 50)"
              class="transition-[stroke-dasharray,stroke-dashoffset]"
            >
              <title>{{ segment.name }}: {{ formatNumber(segment.submissions) }} submissions ({{ segment.share }}%)</title>
            </circle>
            <text x="50" y="49" text-anchor="middle" class="fill-[var(--ui-text-highlighted)] text-[15px] font-semibold tabular-nums">
              {{ formatNumber(result.totals.submissions) }}
            </text>
            <text x="50" y="61" text-anchor="middle" class="fill-[var(--ui-text-muted)] text-[7px]">
              submissions
            </text>
          </svg>
        </div>

        <!-- legend and table in one: identity never relies on colour alone -->
        <ul class="mt-3 divide-y divide-default rounded-lg border border-default">
          <li v-for="segment in donut.segments" :key="segment.id" class="flex items-start gap-2 px-3 py-2">
            <span class="mt-1 size-2.5 shrink-0 rounded-sm" :style="{ background: segment.color }" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2 text-xs">
                <span class="truncate font-medium text-highlighted">{{ segment.name }}</span>
                <span class="tabular-nums">
                  <span class="font-semibold text-highlighted">{{ formatNumber(segment.submissions) }}</span>
                  <span class="text-muted"> · {{ segment.share }}%</span>
                </span>
              </div>
              <p class="text-xs text-muted">
                {{ formatNumber(segment.recipes) }} recipes · runway <span class="text-highlighted">{{ runway(segment.submissions) }}</span>
              </p>
            </div>
          </li>
        </ul>
      </template>
      <p v-if="result.totals.brollShots" class="mt-2 text-xs text-muted">
        {{ result.totals.brollShots }} b-roll shots across channels: every channel films its own clips of each shared shot.
      </p>
    </section>
    <!-- Chart: time per person, on camera + VO stacked -->
    <section>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-xs font-medium text-muted uppercase">
          Time per person
        </h3>
        <div class="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm" style="background: var(--chart-1)" />On camera</span>
          <span class="flex items-center gap-1"><span class="size-2.5 rounded-sm" style="background: var(--chart-2)" />VO</span>
        </div>
      </div>
      <div class="space-y-3">
        <UTooltip
          v-for="person in result.perPerson"
          :key="person.id"
          :text="`${person.name}: on camera ${hours(person.onCameraMin)}, VO ${hours(person.voMin)}`"
          :content="{ side: 'left' }"
        >
          <div class="cursor-default">
            <div class="flex items-baseline justify-between gap-2 text-xs">
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="truncate font-medium text-highlighted">{{ person.name }}</span>
                <span v-if="setsTheDay(person.id)" class="shrink-0 text-muted">· sets the shoot day</span>
              </span>
              <span class="font-semibold text-highlighted tabular-nums">{{ hours(person.onCameraMin + person.voMin) }}</span>
            </div>
            <div
              class="mt-1 flex h-2.5"
              role="img"
              :aria-label="`${person.name}: on camera ${hours(person.onCameraMin)}, VO ${hours(person.voMin)}`"
            >
              <div
                v-if="person.onCameraMin"
                class="h-full"
                :class="person.voMin ? '' : 'rounded-r-[4px]'"
                :style="{ width: barWidth(person.onCameraMin, maxMinutes), background: 'var(--chart-1)' }"
              />
              <!-- 2px surface gap between the stacked segments -->
              <div
                v-if="person.voMin"
                class="h-full rounded-r-[4px]"
                :class="person.onCameraMin ? 'ml-0.5' : ''"
                :style="{ width: barWidth(person.voMin, maxMinutes), background: 'var(--chart-2)' }"
              />
            </div>
            <p class="mt-1 text-xs text-muted">
              On camera {{ hours(person.onCameraMin) }} · VO {{ hours(person.voMin) }}
              · {{ formatNumber(person.recipes) }} recipes
            </p>
          </div>
        </UTooltip>
        <p v-if="!result.perPerson.length" class="text-muted">
          No people on this shoot yet.
        </p>
      </div>
    </section>  </div>
</template>
