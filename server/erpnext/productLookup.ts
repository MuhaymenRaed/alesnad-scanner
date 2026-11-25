import type { AmbiguousCandidate, Product } from '../../shared/api.js'
import type { ErpNextConfig } from '../config.js'
import { AppError } from '../http/errors.js'
import type { Logger } from '../logger.js'
import { ErpNextError, type ErpNextClient, type FrappeFilter } from './client.js'
import type { ItemGroupScope } from './itemGroups.js'
import { normalizeProduct, resolveImagePath, type BarcodeRow, type ItemDoc } from './normalize.js'
import type { PricingService } from './pricing.js'
import type { SchemaService } from './schema.js'

/**
 * Barcode → Item lookup.
 *
 *  1. Exact-match query on the Item Barcode child table (`barcode = <value>`, parent=Item).
 *  2. Results are re-checked with strict string equality, because MariaDB's default collation
 *     is case- and trailing-space-insensitive ("abc" would otherwise match "ABC ").
 *  3. Rows are grouped by parent Item. One Item → that Item. Several Items → 409 with the
 *     candidates; the user picks one and the choice is re-validated against the same match set.
 *  4. Optional (LOOKUP_MATCH_ITEM_CODE=true): if no barcode matched, an exact Item Code match.
 *  5. The full Item is read only after its identifier is known; price is looked up last.
 */

const MAX_MATCH_ROWS = 50
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])

interface ItemSummary {
  name: string
  item_name?: string
  item_group?: string | null
  disabled?: number
}

export interface ProductImage {
  contentType: string
  body: Buffer
}

export interface ProductLookupService {
  lookup(input: { barcode: string; itemCode?: string }): Promise<Product>
  getImage(itemCode: string): Promise<ProductImage>
  /** Loads schema, price-list and item-group caches so the first scan is not slower than the rest. */
  warmUp(): Promise<void>
}

const notFound = () => new AppError('ITEM_NOT_FOUND', 404, 'No product was found for this barcode.')

export function createProductLookupService(deps: {
  client: ErpNextClient
  schema: SchemaService
  pricing: PricingService
  scope: ItemGroupScope
  /** The company's own item-group tree (ERPNEXT_COMPANY_ITEM_GROUP). */
  companyGroups: ItemGroupScope
  config: ErpNextConfig
  logger: Logger
}): ProductLookupService {
  const { client, config } = deps

  async function findBarcodeRows(barcode: string): Promise<BarcodeRow[]> {
    const schema = await deps.schema.get()
    const optional = ['barcode_type', 'uom', 'idx'].filter((f) => f === 'idx' || schema.barcodeFields.has(f))
    const filters: Array<[string, string, string]> = [
      ['barcode', '=', barcode],
      ['parenttype', '=', 'Item'],
    ]
    if (schema.barcodeTableField) filters.push(['parentfield', '=', schema.barcodeTableField])
    const rows = await client.getList<BarcodeRow>(schema.barcodeDoctype, {
      parent: 'Item',
      fields: ['name', 'parent', 'barcode', ...optional],
      filters,
      orderBy: 'parent asc, idx asc',
      limit: MAX_MATCH_ROWS,
    })
    return rows.filter((row) => row.barcode === barcode && typeof row.parent === 'string')
  }

  /**
   * Company scope (ERPNEXT_COMPANY). An Item belongs to the company when:
   *   1. it has an Item Default row for the company, or
   *   2. it has NO Item Default rows at all and its item group is inside the company's group tree
   *      (ERPNEXT_COMPANY_ITEM_GROUP) — new Items often have no defaults yet.
   * An Item whose defaults name only other companies never belongs to it.
   *
   * Decided with list queries filtered inside ERPNext, so Items of other companies are never read
   * in detail, priced, imaged or listed — to the user they simply do not exist.
   * Returns null when no company scope is configured.
   */
  async function companyMembers(base: FrappeFilter[], limit: number): Promise<Set<string> | null> {
    if (!config.company) return null
    const fallback = config.companyItemGroup !== null
    const [own, withAnyDefault, candidates] = await Promise.all([
      client.getList<{ name: string }>('Item', { fields: ['name'], filters: [...base, ['Item Default', 'company', '=', config.company]], limit }),
      fallback
        ? client.getList<{ name: string }>('Item', { fields: ['name'], filters: [...base, ['Item Default', 'company', 'is', 'set']], limit })
        : Promise.resolve([]),
      fallback
        ? client.getList<{ name: string; item_group?: string | null }>('Item', { fields: ['name', 'item_group'], filters: base, limit })
        : Promise.resolve([]),
    ])
    const members = new Set(own.map((row) => row.name))
    const assigned = new Set(withAnyDefault.map((row) => row.name))
    for (const row of candidates) {
      if (!members.has(row.name) && !assigned.has(row.name) && (await deps.companyGroups.isAllowed(row.item_group ?? null))) {
        members.add(row.name)
      }
    }
    return members
  }

  /** The same rule applied to an Item document already read (defence in depth). */
  async function docBelongsToCompany(doc: ItemDoc): Promise<boolean> {
    if (!config.company) return true
    const companies = (doc.item_defaults ?? []).map((row) => row.company).filter(Boolean)
    if (companies.includes(config.company)) return true
    if (companies.length > 0 || config.companyItemGroup === null) return false
    return deps.companyGroups.isAllowed(doc.item_group ?? null)
  }

  async function companyItemsWithBarcode(barcode: string): Promise<Set<string> | null> {
    const schema = await deps.schema.get()
    return companyMembers([[schema.barcodeDoctype, 'barcode', '=', barcode]], MAX_MATCH_ROWS)
  }

  async function findByItemCode(code: string): Promise<boolean> {
    const members = await companyMembers([['name', '=', code]], 5)
    if (members) return members.has(code)
    const rows = await client.getList<{ name: string }>('Item', { fields: ['name'], filters: [['name', '=', code]], limit: 5 })
    return rows.some((row) => row.name === code)
  }

  async function summaries(codes: string[]): Promise<ItemSummary[]> {
    const rows = await client.getList<ItemSummary>('Item', {
      fields: ['name', 'item_name', 'item_group', 'disabled'],
      filters: [['name', 'in', codes]],
      limit: codes.length,
    })
    return rows.filter((row) => codes.includes(row.name)).sort((a, b) => (a.name < b.name ? -1 : 1))
  }

  async function getItem(code: string): Promise<ItemDoc> {
    try {
      return await client.getDoc<ItemDoc>('Item', code)
    } catch (error) {
      // The barcode row pointed at an Item we cannot read (deleted or restricted by user permissions).
      if (error instanceof ErpNextError && error.kind === 'not_found') throw notFound()
      throw error
    }
  }

  return {
    async lookup({ barcode, itemCode }) {
      // All independent queries run in parallel: exact barcode rows, the company scope, and the
      // opt-in Item Code check (only used if no barcode matched).
      const [rows, companyItems, itemCodeMatches] = await Promise.all([
        findBarcodeRows(barcode),
        companyItemsWithBarcode(barcode),
        config.matchItemCode ? findByItemCode(barcode) : Promise.resolve(false),
      ])

      // One row per Item (rows are sorted by parent, idx, so the first is the lowest idx).
      // Items outside the configured company are dropped here, before anything else is read.
      const rowByItem = new Map<string, BarcodeRow>()
      for (const row of rows) {
        if (companyItems && !companyItems.has(row.parent!)) continue
        if (!rowByItem.has(row.parent!)) rowByItem.set(row.parent!, row)
      }

      let matchedBy: Product['matchedBy'] = 'barcode'
      let codes = [...rowByItem.keys()]
      if (codes.length === 0 && itemCodeMatches) {
        codes = [barcode]
        matchedBy = 'item_code'
      }
      if (codes.length === 0) throw notFound()

      let chosen: string
      if (codes.length === 1) {
        chosen = codes[0]!
        if (itemCode !== undefined && itemCode !== chosen) {
          throw new AppError('INVALID_ITEM_CODE', 400, 'The selected item does not match this barcode.')
        }
      } else {
        const inScope: ItemSummary[] = []
        for (const summary of await summaries(codes)) {
          if (await deps.scope.isAllowed(summary.item_group ?? null)) inScope.push(summary)
        }
        if (inScope.length === 0) {
          throw new AppError('ITEM_OUT_OF_SCOPE', 404, 'This barcode belongs to products outside the item groups this scanner covers.')
        }
        if (itemCode !== undefined) {
          // Never trust the browser's choice: it must be one of the exact matches for this barcode.
          if (!inScope.some((s) => s.name === itemCode)) {
            throw new AppError('INVALID_ITEM_CODE', 400, 'The selected item does not match this barcode.')
          }
          chosen = itemCode
        } else if (inScope.length === 1) {
          chosen = inScope[0]!.name
        } else {
          const candidates: AmbiguousCandidate[] = inScope.map((s) => ({
            itemCode: s.name,
            itemName: s.item_name?.trim() || s.name,
            itemGroup: s.item_group ?? null,
            disabled: Number(s.disabled) === 1,
          }))
          deps.logger.warn('barcode matches several items', { count: candidates.length })
          throw new AppError(
            'AMBIGUOUS_BARCODE',
            409,
            'This barcode is assigned to more than one product in ERPNext. Choose the correct one.',
            candidates,
          )
        }
      }

      // Item and its prices are independent reads: fetch them in parallel.
      const [doc, priceFor] = await Promise.all([getItem(chosen), deps.pricing.prepare(chosen)])
      // Defence in depth: the document itself must also belong to the configured company.
      if (!(await docBelongsToCompany(doc))) throw notFound()
      if (!(await deps.scope.isAllowed(doc.item_group ?? null))) {
        throw new AppError('ITEM_OUT_OF_SCOPE', 404, 'This barcode belongs to a product outside the item groups this scanner covers.')
      }
      if (Number(doc.disabled) === 1 && config.disabledItemPolicy === 'reject') {
        throw new AppError('ITEM_DISABLED', 404, 'This product is disabled in ERPNext.')
      }

      const barcodeRow = rowByItem.get(chosen) ?? null
      // Prefer the Item's own copy of the row when present (same data, read with Item permissions).
      const ownRow = doc.barcodes?.find((row) => row.barcode === barcode) ?? barcodeRow
      const product = normalizeProduct({
        doc,
        barcodeRow: matchedBy === 'barcode' ? ownRow : null,
        matchedBy,
        schema: await deps.schema.get(),
        metadataFields: config.metadataFields.filter((field) => !config.itemNameFields.includes(field)),
        itemNameFields: config.itemNameFields,
        baseUrl: config.baseUrl,
      })

      const price = priceFor({ requestedUom: product.uom, stockUom: product.stockUom })

      return {
        ...product,
        price,
        priceList: config.priceList,
        sellingPrice: price.status === 'available' ? price.amount : null,
        currency: price.status === 'available' ? price.currency : null,
      }
    },

    async warmUp() {
      await Promise.all([deps.schema.get(), deps.pricing.warmUp(), deps.scope.warmUp(), deps.companyGroups.warmUp()])
    },

    async getImage(code) {
      // Company check first: another company's Item is not even looked at.
      const members = await companyMembers([['name', '=', code]], 5)
      if (members && !members.has(code)) throw new AppError('IMAGE_NOT_AVAILABLE', 404, 'No image is available for this product.')
      const rows = await client.getList<{ name: string; image?: string | null; item_group?: string | null }>('Item', {
        fields: ['name', 'image', 'item_group'],
        filters: [['name', '=', code]],
        limit: 5,
      })
      const row = rows.find((r) => r.name === code)
      const path = row ? resolveImagePath(row.image, config.baseUrl) : null
      if (!row || !path || !(await deps.scope.isAllowed(row.item_group ?? null))) {
        throw new AppError('IMAGE_NOT_AVAILABLE', 404, 'No image is available for this product.')
      }
      try {
        const file = await client.getFile(path, MAX_IMAGE_BYTES)
        // SVG and anything that is not a plain raster image is refused (SVG can carry script).
        if (!ALLOWED_IMAGE_TYPES.has(file.contentType)) throw new ErpNextError('bad_response', 'not an allowed image type')
        return file
      } catch (error) {
        if (error instanceof ErpNextError && ['not_found', 'permission', 'bad_response'].includes(error.kind)) {
          throw new AppError('IMAGE_NOT_AVAILABLE', 404, 'No image is available for this product.')
        }
        throw error
      }
    },
  }
}
