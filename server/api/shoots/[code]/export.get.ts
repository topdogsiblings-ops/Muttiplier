import { strToU8, zipSync } from 'fflate'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Shoot exports (spec §10): ?format=json | csv | zip.
// Runs as the signed-in user, so RLS decides who can export.
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')!
  const format = String(getQuery(event).format ?? 'json')

  if (!(await serverSupabaseUser(event).catch(() => null))) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to export' })
  }
  const db = await serverSupabaseClient<Database>(event)
  const bundle = await loadShootBundle(db, code)
  if (!bundle) throw createError({ statusCode: 404, statusMessage: 'Shoot not found' })
  if (bundle.shoot.status === 'draft') {
    throw createError({ statusCode: 409, statusMessage: 'Exports are available once the shoot is marked as planned' })
  }
  const unfilled = unfilledItems(bundle)
  if (unfilled.length) {
    throw createError({ statusCode: 409, statusMessage: `Unfilled slots in ${unfilled.map(item => item.code).join(', ')}` })
  }

  const name = `${bundle.shoot.code}_${bundle.shoot.shoot_date ?? 'undated'}`
  const download = (filename: string, type: string) => {
    setHeader(event, 'Content-Type', type)
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  }

  if (format === 'csv') {
    download(`${name}.csv`, 'text/csv; charset=utf-8')
    // BOM so Excel reads the file as UTF-8
    return `﻿${buildCsv(bundle)}`
  }

  if (format === 'zip') {
    const files = Object.fromEntries(
      Object.entries(skeletonFiles(bundle)).map(([path, content]) => [path, strToU8(content)])
    )
    download(`${name}_skeleton.zip`, 'application/zip')
    return Buffer.from(zipSync(files))
  }

  if (format !== 'json') throw createError({ statusCode: 400, statusMessage: 'format must be json, csv or zip' })
  download('manifest.json', 'application/json; charset=utf-8')
  return JSON.stringify(planManifest(bundle), null, 2)
})
