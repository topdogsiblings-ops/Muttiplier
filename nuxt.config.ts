export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  // Internal tool behind Google sign-in: no need for server rendering.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Muttiplier',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        // Saved to the home screen, open as a standalone app rather than in Safari.
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Muttiplier' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        // The status bar follows the app's background in light and dark mode.
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#1c1917', media: '(prefers-color-scheme: dark)' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    // Dropbox app (spec §12); its redirect URIs are <origin>/api/dropbox/callback
    dropboxAppKey: process.env.DROPBOX_APP_KEY ?? '',
    dropboxAppSecret: process.env.DROPBOX_APP_SECRET ?? ''
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
