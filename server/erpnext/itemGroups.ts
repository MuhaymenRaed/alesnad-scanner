import type { Logger } from '../logger.js'
import { cachedValue } from './cache.js'
import { ErpNextError, type ErpNextClient } from './client.js'

/**
 * Optional ERPNEXT_ITEM_GROUPS scope. Item groups form a nested-set tree in ERPNext
 * (lft/rgt), so a configured group also admits every group beneath it.
 */

interface ItemGroupRow {
  name: string
  lft?: number
  rgt?: number
}

export interface ItemGroupScope {
  /** True when no scope is configured or the group is inside it. */
  isAllowed(itemGroup: string | null): Promise<boolean>
  warmUp(): Promise<void>
}

/** Pure: expand configured groups to themselves plus all descendants. */
export function expandGroups(configured: string[], rows: ItemGroupRow[]): Set<string> {
  const allowed = new Set(configured)
  for (const root of rows.filter((r) => configured.includes(r.name))) {
    if (typeof root.lft !== 'number' || typeof root.rgt !== 'number') continue
    for (const row of rows) {
      if (typeof row.lft === 'number' && row.lft > root.lft && row.lft < root.rgt) allowed.add(row.name)
    }
  }
  return allowed
}

export function createItemGroupScope(client: ErpNextClient, configured: string[], logger: Logger): ItemGroupScope {
  const allowedGroups = cachedValue(async () => {
    try {
      const rows = await client.getList<ItemGroupRow>('Item Group', { fields: ['name', 'lft', 'rgt'], limit: 0 })
      return { value: expandGroups(configured, rows), ttlMs: 10 * 60 * 1000 }
    } catch (error) {
      if (error instanceof ErpNextError && (error.kind === 'permission' || error.kind === 'not_found')) {
        logger.warn('cannot read the Item Group tree; ERPNEXT_ITEM_GROUPS matches exact group names only')
        return { value: new Set(configured), ttlMs: 10 * 60 * 1000 }
      }
      throw error
    }
  })

  return {
    async isAllowed(itemGroup) {
      if (configured.length === 0) return true
      if (!itemGroup) return false
      return (await allowedGroups.get()).has(itemGroup)
    },
    async warmUp() {
      if (configured.length > 0) await allowedGroups.get()
    },
  }
}
