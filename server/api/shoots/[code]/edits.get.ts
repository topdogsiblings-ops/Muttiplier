// Check the editors' work before a shoot can be marked ready for shortlist (spec §14).
export default defineEventHandler(async (event) => {
  const { bundle, raw, edited, onPhones } = await shootEdits(event)
  return checkEdits(bundle, raw, edited, onPhones)
})
