// A Top Dog Cut license token for the member signed in to Kit: their current org's, or { orgId } to
// pick one they're in. Always issued to a member; whether Cut opens is in the token
// (subscriptionState, cutPurchased). Cut itself connects with a code (./device/*).
export default defineEventHandler(async (event) => {
  const userId = await licenseUser(event)
  const body = await readBody<{ orgId?: string } | null>(event).catch(() => null)
  const orgId = await licenseOrg(event, userId, body?.orgId)
  return await issueLicense(event, orgId, userId)
})
