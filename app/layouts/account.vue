<template>
  <!-- Your account: the top bar, and the page below it (no organisation sidebar) -->
  <div class="flex h-dvh flex-col bg-default">
    <AppTopBar account />
    <main class="min-h-0 flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
