<script setup lang="ts">
// Billing lives in Settings → Profile for admins; this page is for everyone else (where things
// stand, and who to ask), and sends admins there, keeping Stripe's ?checkout / ?klip on the way.
const route = useRoute()
const { isAdmin } = useAccess()
if (isAdmin.value) await navigateTo({ path: '/settings', query: { ...route.query, tab: 'profile' } }, { replace: true })
</script>

<template>
  <UDashboardPanel id="billing">
    <template #header>
      <UDashboardNavbar title="Billing" />
    </template>

    <template #body>
      <BillingSettings class="mx-auto w-full max-w-xl" />
    </template>
  </UDashboardPanel>
</template>
