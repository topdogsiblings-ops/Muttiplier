<script setup lang="ts">
// Duplicate / archive / restore for a Library row. Archiving asks for confirmation first;
// restoring doesn't, since it's harmless.
const props = defineProps<{
  archived: boolean
  duplicable?: boolean
  /** what the row is, for the confirmation text, e.g. "hook" */
  noun: string
}>()
const emit = defineEmits<{ duplicate: [], archive: [archived: boolean] }>()

const confirming = ref(false)

function onArchiveClick() {
  if (props.archived) emit('archive', false)
  else confirming.value = true
}

function confirmArchive() {
  confirming.value = false
  emit('archive', true)
}
</script>

<template>
  <div class="flex shrink-0 items-center" @click.stop>
    <UTooltip v-if="props.duplicable" text="Duplicate">
      <UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Duplicate" @click="emit('duplicate')" />
    </UTooltip>
    <UTooltip :text="props.archived ? 'Restore' : 'Archive'">
      <UButton
        :icon="props.archived ? 'i-lucide-archive-restore' : 'i-lucide-archive'"
        color="neutral"
        variant="ghost"
        :aria-label="props.archived ? 'Restore' : 'Archive'"
        @click="onArchiveClick"
      />
    </UTooltip>

    <UModal v-model:open="confirming" :title="`Archive this ${props.noun}?`">
      <template #body>
        <p class="text-sm text-default">
          It will be hidden from the Library and can't be added to new shoots. Shoots that already use it keep it unchanged.
        </p>
        <p class="mt-2 text-sm text-muted">
          You can restore it any time from the Archived view.
        </p>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
          <UButton label="Archive" icon="i-lucide-archive" color="warning" @click="confirmArchive" />
        </div>
      </template>
    </UModal>
  </div>
</template>
