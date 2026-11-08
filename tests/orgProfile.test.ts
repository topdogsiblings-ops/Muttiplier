import { describe, expect, it } from 'vitest'
import { AD_CATEGORIES, categoriesToText, recommendedPreamble, textToCategories, EMPTY_PROFILE } from '../shared/utils/orgProfile'

describe('ad categories', () => {
  it('writes picks as words and reads them back', () => {
    const picks = ['Pets', 'Pet Toys', 'Supplements & Nutrition']
    const text = categoriesToText(picks)
    expect(text).toBe('Pets, Pet Toys and Supplements & Nutrition')
    expect(textToCategories(text)).toEqual(picks)
  })

  it('handles one pick and none', () => {
    expect(categoriesToText(['Pets'])).toBe('Pets')
    expect(categoriesToText([])).toBe('')
    expect(textToCategories('')).toEqual([])
  })

  it('reads older free text into parts', () => {
    expect(textToCategories('dog food, treats and supplements')).toEqual(['dog food', 'treats', 'supplements'])
  })

  it('keeps every category whole through a round trip', () => {
    expect(textToCategories(categoriesToText([...AD_CATEGORIES]))).toEqual([...AD_CATEGORIES])
  })

  it('reads well in the preamble', () => {
    const preamble = recommendedPreamble('Kompany', { ...EMPTY_PROFILE, products: categoriesToText(['Pets', 'Pet Toys']) })
    expect(preamble).toContain('The ads are for Pets and Pet Toys.')
  })
})
