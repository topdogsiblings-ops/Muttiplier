import { createMcpHandler, requireBearerAuth } from '@modelcontextprotocol/server'

// The AI connector's MCP endpoint (spec §11): https://<kreate>/mcp. Stateless: every request is
// signed in (a Supabase OAuth token for an AI app the person approved) and served by a fresh server
// acting as them. Without a valid token it answers 401 with where to sign in (resource_metadata).
// Browser-based AI apps call it cross-origin, so it answers CORS (tokens, not cookies, so any origin).
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID',
    'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version'
  })
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }

  const gate = requireBearerAuth({ verifier: connectorVerifier(event), resourceMetadataUrl: connectorMetadataUrl(event) })
  const request = toWebRequest(event)
  const auth = await gate(request)
  if (auth instanceof Response) return sendWebResponse(event, auth)

  const handler = createMcpHandler(() => buildConnectorServer(event, auth.token, auth.clientId), {
    onerror: error => console.error('AI connector:', error)
  })
  try {
    return sendWebResponse(event, await handler.fetch(request, { authInfo: auth }))
  } finally {
    await handler.close()
  }
})
