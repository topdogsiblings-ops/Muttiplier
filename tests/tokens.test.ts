import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chart, colors, primary, surface } from '../shared/design/tokens'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/** the --chart-N values in one CSS block, in order */
const chartVars = (block: string) => [...block.matchAll(/--chart-(\d+):\s*(#[0-9a-f]{6})/gi)]
  .sort((a, b) => Number(a[1]) - Number(b[1]))
  .map(match => match[2])

describe('design tokens', () => {
  const css = read('app/assets/css/main.css')

  it('match the chart colours in main.css, light and dark', () => {
    expect(chartVars(css.slice(css.indexOf(':root'), css.indexOf('.dark')))).toEqual([...chart.light])
    expect(chartVars(css.slice(css.indexOf('.dark'), css.indexOf('@layer')))).toEqual([...chart.dark])
  })

  it('match the surfaces in nuxt.config and are the theme the app has always had', () => {
    const config = read('nuxt.config.ts')
    expect(config).toContain(`content: '${surface.light}', media: '(prefers-color-scheme: light)'`)
    expect(config).toContain(`content: '${surface.dark}', media: '(prefers-color-scheme: dark)'`)
    expect(colors).toEqual({ primary: 'stone', neutral: 'stone' })
  })

  it('match the primary colour in main.css: black on light, white on dark', () => {
    const value = (block: string) => block.match(/--ui-primary:\s*(#[0-9a-f]{6})/i)?.[1]
    expect(value(css.slice(css.indexOf(':root'), css.indexOf('.dark')))).toBe(primary.light)
    expect(value(css.slice(css.indexOf('.dark'), css.indexOf('@layer')))).toBe(primary.dark)
  })
})
