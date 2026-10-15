export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  // Internal tool behind Google sign-in: no need for server rendering.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Muttiplier',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
    }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5'
  },

  compatibilityDate: '2026-10-01',

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    types: '~~/shared/types/database.types.ts',
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: []
    }
  }
})
