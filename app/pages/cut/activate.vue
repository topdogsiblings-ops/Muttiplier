<script setup lang="ts">
// The old address for connecting UGC Klip: on to /klip/activate, code and all. Goes once every
// Klip build uses the verification address /api/license/device/start returns.
definePageMeta({ layout: 'plain' })
const route = useRoute()
await navigateTo({ path: '/klip/activate', query: route.query }, { replace: true })
</script>

<template>
  <div />
</template>
