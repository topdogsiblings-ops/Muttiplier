import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'
import { OAuthError, OAuthErrorCode, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'
import type { AuthInfo, OAuthTokenVerifier } from '@modelcontextprotocol/server'
import type { Database } from '#shared/types/database.types'

// Kreate's AI connector (spec §11): an MCP server at /mcp that people's own AI apps (Claude,
// ChatGPT…) connect to. Supabase Auth is the OAuth 2.1 server: the AI app finds it from our
// protected resource metadata, the person approves it on /oauth/consent, and Supabase issues it a
// token for that person. Every request runs as them, so the database's own rules keep it inside
// their current organisation. Kreate has no AI of its own.

/** The MCP endpoint's URL, from the request (so it follows whichever domain served it). */
export function connectorUrl(event: H3Event) {
  return new URL('/mcp', getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin)
}

/** The protected resource metadata (RFC 9728): where AI apps go to sign in. */
export function connectorMetadata(event: H3Event) {
  const { url } = useRuntimeConfig(event).public.supabase
  return {
    resource: connectorUrl(event).href,
    authorization_servers: [`${url}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'Kreate',
    resource_documentation: new URL('/account#ai', connectorUrl(event)).href
  }
}

export const connectorMetadataUrl = (event: H3Event) => getOAuthProtectedResourceMetadataUrl(connectorUrl(event))

/** A database client that acts as the person the token belongs to (their organisation's rules apply). */
export function connectorDb(event: H3Event, token: string) {
  const { url, key } = useRuntimeConfig(event).public.supabase
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

/**
 * Accepts only tokens Supabase issued to an AI app through the consent flow (they carry the app's
 * `client_id`), checked with Supabase; an ordinary browser session can't be used here.
 */
export function connectorVerifier(event: H3Event): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const { data, error } = await connectorDb(event, token).auth.getClaims(token)
      const claims = data?.claims as (Record<string, unknown> & { sub?: string, exp?: number }) | undefined
      if (error || !claims?.sub) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Sign in to Kreate again')
      const clientId = typeof claims.client_id === 'string' ? claims.client_id : null
      if (!clientId) throw new OAuthError(OAuthErrorCode.InvalidToken, 'Connect through your AI app to use Kreate here')
      return {
        token,
        clientId,
        scopes: typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [],
        expiresAt: claims.exp,
        extra: { userId: claims.sub }
      }
    }
  }
}
