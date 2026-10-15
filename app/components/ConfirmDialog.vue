<script setup lang="ts">
// The single confirmation dialog behind useConfirm(). Mounted once in app.vue.
const { request, answer } = useConfirm()
</script>

<template>
  <UModal :open="!!request" :title="request?.title" @update:open="!$event && answer(false)">
    <template v-if="request?.description" #body>
      <p class="text-sm whitespace-pre-line text-default">
        {{ request.description }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="answer(false)" />
        <UButton
          :label="request?.confirmLabel ?? 'Confirm'"
          :color="request?.danger ? 'error' : 'primary'"
          :icon="request?.danger ? 'i-lucide-trash-2' : undefined"
          @click="answer(true)"
        />
      </div>
    </template>
  </UModal>
</template>
