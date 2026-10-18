// A ready shoot's shortlists so far, and how many renders a new one can choose from: every
// recipe in each b-roll variation, less those already shortlisted and any with a part rated bad.
export default defineEventHandler(async (event) => {
  const { db, bundle, edited } = await shootEdits(event)
  const { data: shortlists } = await db.from('shoot_shortlists')
    .select('code, size, entry_ids, created_at, created_by').eq('shoot_id', bundle.shoot.id).order('code')
  const recipes = buildRecipes(bundle, edited)
  const renders = buildRenders(bundle, edited, recipes)
  const ratings = new Map(bundle.items.filter(item => item.rating).map(item => [item.id, item.rating!]))
  const exclude = new Set((shortlists ?? []).flatMap(row => row.entry_ids))
  return {
    recipes: recipes.length,
    renders: renders.length,
    available: availableRenders(renders, { exclude, ratings }).length,
    shortlists: (shortlists ?? []).map(({ entry_ids: _ids, ...row }) => row)
  }
})
