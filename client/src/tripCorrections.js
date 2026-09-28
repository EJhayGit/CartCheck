import { normalizeMoney } from './money.js'

export function prepareCorrectionItems(draft) {
  return draft.map((item, index) => {
    const name = item.name.trim()
    const category = item.category.trim()
    const unitLabel = item.unitLabel.trim()
    const quantity = String(item.quantity).trim()
    if (!name || name.length > 120 || !category || category.length > 80) throw new Error(`Check item ${index + 1}'s name and category.`)
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0) throw new Error(`Check item ${index + 1}'s quantity.`)
    if (unitLabel.length > 24) throw new Error(`Item ${index + 1}'s unit is too long.`)
    return { ...item, name, category, quantity, unitLabel, estimatedTotal: normalizeMoney(item.estimatedTotal), actualTotal: normalizeMoney(item.actualTotal) }
  })
}
