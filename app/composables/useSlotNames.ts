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
 * The slots a script can use. The built-ins fill themselves; any other `{{name}}` is a custom
 * slot, filled in on each shoot (the planner's Fill in slots), so it isn't defined anywhere first.
 */
export const useSlotNames = () => {
  const slots = computed<SlotInfo[]>(() =>
    BUILT_IN_SLOTS.map(name => ({ name, builtIn: true, description: BUILT_IN_DESCRIPTIONS[name]! })))

  const isBuiltIn = (name: string) => (BUILT_IN_SLOTS as readonly string[]).includes(name.toLowerCase())

  return { slots, isBuiltIn }
}
