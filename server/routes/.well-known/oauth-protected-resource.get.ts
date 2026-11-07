// The same document at the root, for AI apps that look there first.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
  return connectorMetadata(event)
})
