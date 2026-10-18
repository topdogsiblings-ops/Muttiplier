// Generate the next shortlist for a ready shoot (spec §14): writes recipes.json (every recipe,
// refreshed each time), shortlists/SLnn.json (+ a CSV for people) referencing those recipes with
// a b-roll order each, and an empty renders/SLnn/ folder for the stitched videos.
export default defineEventHandler(async (event) => {
  const { db, bundle, accessToken, base, edited } = await shootEdits(event)
  if (bundle.shoot.status !== 'edited') throw createError({ statusCode: 409, statusMessage: 'Mark the shoot ready for shortlist first' })
  const { size } = await readBody<{ size?: number }>(event)
  if (!size || size < 1 || !Number.isInteger(size)) throw createError({ statusCode: 400, statusMessage: 'How many recipes?' })

  const { data: previous } = await db.from('shoot_shortlists').select('code, entry_ids').eq('shoot_id', bundle.shoot.id)
  const recipes = buildRecipes(bundle, edited)
  const renders = buildRenders(bundle, edited, recipes)
  const ratings = new Map(bundle.items.filter(item => item.rating).map(item => [item.id, item.rating!]))
  const exclude = new Set((previous ?? []).flatMap(row => row.entry_ids))
  const entries = chooseShortlist(renders, { size, exclude, ratings })
  if (!entries.length) throw createError({ statusCode: 409, statusMessage: 'Nothing left to shortlist: every render has been used or has a part rated bad' })

  const code = nextShortlistCode((previous ?? []).map(row => row.code))
  const person = (slug: string) => bundle.people.find(p => p.slug === slug)?.name ?? slug
  const generatedAt = new Date().toISOString()

  await dropboxWriteText(accessToken, `${base}/recipes.json`, JSON.stringify({
    schema_version: 1,
    shoot: bundle.shoot.code,
    generated_at: generatedAt,
    // file paths are relative to the shoot's edited/ folder
    recipes: recipes.map(recipe => ({
      ...recipe,
      hook: { ...recipe.hook, name: person(recipe.hook.person) },
      vo: { ...recipe.vo, name: person(recipe.vo.person) },
      cta: { ...recipe.cta, name: person(recipe.cta.person) }
    }))
  }, null, 2))
  await dropboxWriteText(accessToken, `${base}/shortlists/${code}.json`, JSON.stringify({
    schema_version: 1,
    shoot: bundle.shoot.code,
    shortlist: code,
    generated_at: generatedAt,
    // recipes are in ../recipes.json; b-roll paths are relative to edited/; render into renders/<shortlist>/
    recipes_file: 'recipes.json',
    renders_folder: `renders/${code}`,
    entries
  }, null, 2))
  await dropboxWriteText(accessToken, `${base}/shortlists/${code}.csv`, shortlistCsv(entries, recipes))
  await dropboxEnsureFolder(accessToken, `${base}/renders/${code}`)

  const { error } = await db.from('shoot_shortlists').insert({ shoot_id: bundle.shoot.id, code, size: entries.length, entry_ids: entries.map(entry => entry.id) })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { code, size: entries.length, asked: size, folder: `${base}/shortlists/${code}.json` }
})
