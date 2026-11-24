import type { AvailablePrice, SellingPrice, UnavailablePrice } from '../../shared/api.js'
import type { Logger } from '../logger.js'
import { cachedValue } from './cache.js'
import { ErpNextError, type ErpNextClient } from './client.js'
import type { SchemaService } from './schema.js'

/**
 * Selling-price selection, mirroring ERPNext's own `get_item_price` rules for a walk-up
 * (no customer) sale, but without inventing numbers:
 *
 *  1. Only Item Price records for the matched Item in the CONFIGURED price list. There is no
 *     fallback to any other price list.
 *  2. The record must be a selling price (`selling = 1`). Records that are also buying prices
 *     are rejected unless ERPNEXT_ALLOW_BUYING_PRICE_LIST=true (they may be internal costs).
 *  3. General prices only: no customer, supplier or batch-specific prices.
 *  4. Valid today: valid_from ≤ today ≤ valid_upto (blank bounds are open).
 *  5. Must have a numeric rate and a currency.
 *  6. Unit: a price for the requested unit (barcode UOM → sales UOM → stock UOM) wins. A blank-UOM
 *     price counts as the stock unit. If the requested unit has no price, the stock-unit price
 *     is returned and explicitly labelled as such (no conversion maths is applied).
 *  7. Deterministic tie-break: latest valid_from first (undated last), explicit UOM before blank,
 *     most recently modified, then record name.
 */

export interface ItemPriceRecord {
  name: string
  item_code?: string
  price_list?: string
  price_list_rate?: number | null
  currency?: string | null
  uom?: string | null
  valid_from?: string | null
  valid_upto?: string | null
  customer?: string | null
  supplier?: string | null
  batch_no?: string | null
  buying?: number | null
  selling?: number | null
  modified?: string | null
}

export interface PriceContext {
  itemCode: string
  priceList: string
  /** Unit being looked up (barcode UOM → sales UOM → stock UOM). */
  requestedUom: string
  stockUom: string | null
  /** YYYY-MM-DD in the server's time zone (set TZ to match ERPNext). */
  today: string
  allowBuyingPriceList: boolean
}

const MESSAGES: Record<UnavailablePrice['reason'], string> = {
  NO_PRICE_IN_LIST: 'This item has no price in the selling price list.',
  NO_VALID_PRICE: 'This item has no selling price that is valid today for walk-in customers.',
  NO_PRICE_FOR_UOM: 'This item has no selling price for this unit of measure.',
  PRICE_LIST_NOT_FOUND: 'The configured selling price list does not exist in ERPNext.',
  PRICE_LIST_DISABLED: 'The configured selling price list is disabled in ERPNext.',
  NOT_A_SELLING_PRICE_LIST: 'The configured price list is not a selling price list.',
  PRICE_LIST_IS_BUYING_LIST: 'The configured price list is also a buying price list, so its prices are not shown.',
  PRICE_PERMISSION_DENIED: 'The ERPNext integration account is not allowed to read prices.',
  PRICE_LOOKUP_FAILED: 'The price could not be loaded from ERPNext right now.',
}

export function unavailable(priceList: string, reason: UnavailablePrice['reason'], availableUoms?: string[]): UnavailablePrice {
  return { status: 'unavailable', priceList, reason, message: MESSAGES[reason], ...(availableUoms ? { availableUoms } : {}) }
}

const blank = (value: unknown) => value === null || value === undefined || value === ''
const flag = (value: unknown) => Number(value) === 1

function compareCandidates(a: ItemPriceRecord, b: ItemPriceRecord): number {
  const fromA = a.valid_from ?? ''
  const fromB = b.valid_from ?? ''
  if (fromA !== fromB) return fromA > fromB ? -1 : 1 // latest first; '' (undated) sorts last
  const uomA = blank(a.uom) ? 1 : 0
  const uomB = blank(b.uom) ? 1 : 0
  if (uomA !== uomB) return uomA - uomB
  const modA = a.modified ?? ''
  const modB = b.modified ?? ''
  if (modA !== modB) return modA > modB ? -1 : 1
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** Pure selection function — see the rules at the top of this file. */
export function selectSellingPrice(records: ItemPriceRecord[], ctx: PriceContext): SellingPrice {
  const inList = records.filter((r) => r.item_code === ctx.itemCode && r.price_list === ctx.priceList)
  if (inList.length === 0) return unavailable(ctx.priceList, 'NO_PRICE_IN_LIST')

  const selling = inList.filter((r) => r.selling === undefined || flag(r.selling))
  if (selling.length === 0) return unavailable(ctx.priceList, 'NOT_A_SELLING_PRICE_LIST')

  const notBuying = ctx.allowBuyingPriceList ? selling : selling.filter((r) => !flag(r.buying))
  if (notBuying.length === 0) return unavailable(ctx.priceList, 'PRICE_LIST_IS_BUYING_LIST')

  const eligible = notBuying.filter(
    (r) =>
      blank(r.customer) &&
      blank(r.supplier) &&
      blank(r.batch_no) &&
      (blank(r.valid_from) || (r.valid_from as string) <= ctx.today) &&
      (blank(r.valid_upto) || (r.valid_upto as string) >= ctx.today) &&
      typeof r.price_list_rate === 'number' &&
      Number.isFinite(r.price_list_rate) &&
      !blank(r.currency),
  )
  if (eligible.length === 0) return unavailable(ctx.priceList, 'NO_VALID_PRICE')

  const stockUom = ctx.stockUom ?? ctx.requestedUom
  const isStockUnit = (r: ItemPriceRecord) => blank(r.uom) || r.uom === stockUom

  let uomMatch: AvailablePrice['uomMatch'] = 'exact'
  let candidates =
    ctx.requestedUom === stockUom ? eligible.filter(isStockUnit) : eligible.filter((r) => r.uom === ctx.requestedUom)
  if (candidates.length === 0 && ctx.requestedUom !== stockUom) {
    candidates = eligible.filter(isStockUnit)
    uomMatch = 'stock_uom_fallback'
  }
  if (candidates.length === 0) {
    const availableUoms = [...new Set(eligible.map((r) => r.uom).filter((u): u is string => !blank(u)))].sort()
    return unavailable(ctx.priceList, 'NO_PRICE_FOR_UOM', availableUoms)
  }

  const chosen = [...candidates].sort(compareCandidates)[0]!
  return {
    status: 'available',
    amount: chosen.price_list_rate as number,
    currency: chosen.currency as string,
    priceList: ctx.priceList,
    uom: blank(chosen.uom) ? stockUom : (chosen.uom as string),
    requestedUom: ctx.requestedUom,
    uomMatch,
    validFrom: chosen.valid_from ?? null,
    validUpto: chosen.valid_upto ?? null,
  }
}

/** Today's date (YYYY-MM-DD) in the process time zone. Set TZ to the ERPNext system time zone. */
export function localIsoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

interface PriceListDoc {
  enabled?: number
  selling?: number
  buying?: number
}

type PriceListStatus = { kind: 'ok' } | { kind: 'unverifiable' } | { kind: 'problem'; reason: UnavailablePrice['reason'] }

export interface UnitContext {
  requestedUom: string
  stockUom: string | null
}

export interface PricingService {
  /**
   * Fetches the Item Price records for an item. Only needs the item code, so it can run in
   * parallel with reading the Item itself; the units are applied afterwards.
   */
  prepare(itemCode: string): Promise<(units: UnitContext) => SellingPrice>
  /** Pre-loads the price-list status cache (called at startup). */
  warmUp(): Promise<void>
}

const ITEM_PRICE_FIELDS = [
  'name', 'item_code', 'price_list', 'price_list_rate', 'currency', 'uom', 'valid_from', 'valid_upto',
  'customer', 'supplier', 'batch_no', 'buying', 'selling', 'modified',
]

export function createPricingService(deps: {
  client: ErpNextClient
  schema: SchemaService
  logger: Logger
  priceList: string
  allowBuyingPriceList: boolean
  today?: () => string
}): PricingService {
  const { client, logger, priceList, allowBuyingPriceList } = deps
  const today = deps.today ?? (() => localIsoDate())

  // The Price List document tells us whether the list is enabled / selling / buying. Reading it
  // needs "Price List" read permission; without it we fall back to the flags on each Item Price.
  const priceListStatus = cachedValue<PriceListStatus>(async () => {
    try {
      const doc = await client.getDoc<PriceListDoc>('Price List', priceList)
      let status: PriceListStatus = { kind: 'ok' }
      if (!flag(doc.enabled)) status = { kind: 'problem', reason: 'PRICE_LIST_DISABLED' }
      else if (!flag(doc.selling)) status = { kind: 'problem', reason: 'NOT_A_SELLING_PRICE_LIST' }
      else if (flag(doc.buying) && !allowBuyingPriceList) status = { kind: 'problem', reason: 'PRICE_LIST_IS_BUYING_LIST' }
      if (status.kind === 'problem') logger.warn('configured price list cannot be used', { reason: status.reason })
      return { value: status, ttlMs: 5 * 60 * 1000 }
    } catch (error) {
      if (error instanceof ErpNextError && error.kind === 'not_found') {
        logger.error('configured price list does not exist in ERPNext')
        return { value: { kind: 'problem', reason: 'PRICE_LIST_NOT_FOUND' } as PriceListStatus, ttlMs: 60 * 1000 }
      }
      if (error instanceof ErpNextError && error.kind === 'permission') {
        logger.warn('no permission to read Price List; relying on Item Price flags')
        return { value: { kind: 'unverifiable' } as PriceListStatus, ttlMs: 5 * 60 * 1000 }
      }
      throw error
    }
  })

  async function fetchRecords(itemCode: string): Promise<ItemPriceRecord[]> {
    const schema = await deps.schema.get()
    const fields = ITEM_PRICE_FIELDS.filter((f) => f === 'name' || f === 'modified' || schema.itemPriceFields.has(f))
    return client.getList<ItemPriceRecord>('Item Price', {
      fields,
      filters: [
        ['item_code', '=', itemCode],
        ['price_list', '=', priceList],
      ],
      orderBy: 'modified desc',
      limit: 100,
    })
  }

  return {
    async prepare(itemCode) {
      try {
        const [status, records] = await Promise.all([priceListStatus.get(), fetchRecords(itemCode)])
        if (status.kind === 'problem') return () => unavailable(priceList, status.reason)
        const date = today()
        return (units) => selectSellingPrice(records, { itemCode, priceList, ...units, today: date, allowBuyingPriceList })
      } catch (error) {
        if (error instanceof ErpNextError) {
          // Auth failures break everything and should surface as a full error.
          if (error.kind === 'auth') throw error
          logger.warn('price lookup failed', { kind: error.kind })
          const reason = error.kind === 'permission' ? 'PRICE_PERMISSION_DENIED' : 'PRICE_LOOKUP_FAILED'
          return () => unavailable(priceList, reason)
        }
        throw error
      }
    },

    async warmUp() {
      await priceListStatus.get()
    },
  }
}
