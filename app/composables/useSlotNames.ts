export interface SlotInfo {
  name: string
  builtIn: boolean
  description: string
}

const BUILT_IN_DESCRIPTIONS: Record<string, string> = {
  brand: 'Brand name, filled from the product',
  product: 'Product name, filled from the product',
  dog: 'The channel\'s dog phrase, e.g. “my Doberman”'
}

/**
 * Every slot a script can use: the built-ins plus each custom slot defined on any
 * product's slot values. A slot is "recognised" when it is one of these.
 */
export const useSlotNames = () => {
  const { products } = useRefData()

  const slots = computed<SlotInfo[]>(() => {
    const usedBy = new Map<string, string[]>()
    for (const product of products.value) {
      const values = (product.slot_values ?? {}) as Record<string, unknown>
      for (const key of Object.keys(values)) {
        const name = key.toLowerCase()
        if ((BUILT_IN_SLOTS as readonly string[]).includes(name)) continue
        usedBy.set(name, [...(usedBy.get(name) ?? []), product.name])
      }
    }
    const custom = [...usedBy.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, names]) => ({
        name,
        builtIn: false,
        description: `Custom slot, set on ${names.length} product${names.length === 1 ? '' : 's'}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`
      }))
    return [
      ...BUILT_IN_SLOTS.map(name => ({ name, builtIn: true, description: BUILT_IN_DESCRIPTIONS[name]! })),
      ...custom
    ]
  })

  const known = computed(() => new Set(slots.value.map(slot => slot.name)))
  const isKnown = (name: string) => known.value.has(name.toLowerCase())

  return { slots, isKnown }
}
