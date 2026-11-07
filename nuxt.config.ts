export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],

  // Internal tool behind Google sign-in: no need for server rendering.
  ssr: false,

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Kreate | by UGC Company',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        // Saved to the home screen, open as a standalone app rather than in Safari.
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Kreate' },
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
    // Dropbox app (spec §12); its redirect URIs are <origin>/api/dropbox/callback
    dropboxAppKey: process.env.DROPBOX_APP_KEY ?? '',
    dropboxAppSecret: process.env.DROPBOX_APP_SECRET ?? '',
    // Billing (Stripe, Managed Payments); the webhook is <origin>/api/billing/webhook
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    stripePriceLookupKey: process.env.STRIPE_PRICE_LOOKUP_KEY ?? 'top_dog_kit_monthly',
    stripeKlipPriceLookupKey: process.env.STRIPE_KLIP_PRICE_LOOKUP_KEY ?? 'ugc_klip',
    // Klip's license tokens (Phase 5): an Ed25519 private key, PKCS#8 DER in base64. Pawcessor
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
      // a password reset link signs them in on the page itself
      exclude: ['/reset-password'],
      // signing in returns to the page that asked for it (e.g. Klip's activation link)
      saveRedirectToCookie: true
    }
  }
})
