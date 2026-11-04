export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  // Internal tool behind Google sign-in: no need for server rendering.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Top Dog Kit',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        // Saved to the home screen, open as a standalone app rather than in Safari.
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Top Dog Kit' },
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
    dropboxAppSecret: process.env.DROPBOX_APP_SECRET ?? '',
    // Billing (Stripe, Managed Payments); the webhook is <origin>/api/billing/webhook
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    stripePriceLookupKey: process.env.STRIPE_PRICE_LOOKUP_KEY ?? 'top_dog_kit_monthly',
    stripeCutPriceLookupKey: process.env.STRIPE_CUT_PRICE_LOOKUP_KEY ?? 'top_dog_cut',
    // Cut's license tokens (Phase 5): an Ed25519 private key, PKCS#8 DER in base64. Pawcessor
    // holds the public key and checks tokens offline.
    licensePrivateKey: process.env.LICENSE_PRIVATE_KEY ?? ''
  },

  compatibilityDate: '2026-10-01',

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    types: '~~/shared/types/database.types.ts',
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: [],
      // signing in returns to the page that asked for it (e.g. Cut's activation link)
      saveRedirectToCookie: true
    }
  }
})
