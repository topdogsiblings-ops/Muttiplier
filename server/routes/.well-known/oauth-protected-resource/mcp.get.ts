// Where the AI connector's 401 points (RFC 9728, path-aware): which authorization server issues
// tokens for /mcp. AI apps follow it to Supabase Auth to sign the person in.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  return connectorMetadata(event)
})
