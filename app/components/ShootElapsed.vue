<script setup lang="ts">
// How long the shoot has been running: ticks live while shooting, fixed once it's ended.
// A resumed shoot keeps its first start, so its time includes the break.
const props = defineProps<{
  shoot: { status: string, started_at: string | null, ended_at: string | null }
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
watchEffect((onCleanup) => {
  if (props.shoot.status !== 'shooting') return
  now.value = Date.now()
  timer = setInterval(() => (now.value = Date.now()), 1000)
  onCleanup(() => clearInterval(timer))
})

const elapsed = computed(() => {
  if (!props.shoot.started_at) return null
  const end = props.shoot.ended_at ? Date.parse(props.shoot.ended_at) : now.value
  const seconds = Math.max(0, Math.floor((end - Date.parse(props.shoot.started_at)) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
})
</script>

<template>
  <span
    v-if="elapsed"
    class="inline-flex items-center gap-1 text-sm font-medium tabular-nums"
    :class="props.shoot.status === 'shooting' ? 'text-warning' : 'text-muted'"
    :title="props.shoot.status === 'shooting' ? 'Time since the shoot started' : 'How long the shoot took'"
  >
    <UIcon name="i-lucide-timer" class="size-4" />{{ elapsed }}
  </span>
</template>
