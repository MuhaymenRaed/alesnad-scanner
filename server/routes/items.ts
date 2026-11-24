import { Router } from 'express'
import type { ApiSuccess, Product } from '../../shared/api.js'
import { validateBarcode, validateItemCode } from '../../shared/barcode.js'
import type { ProductLookupService } from '../erpnext/productLookup.js'
import { AppError } from '../http/errors.js'
import type { Logger } from '../logger.js'

/**
 * Product endpoints. Mounted behind the auth middleware — these handlers only ever run for a
 * verified, authorized Clerk user. Neither accepts a doctype, URL or field list from the client.
 */
export function createItemsRouter(lookupService: ProductLookupService, logger: Logger): Router {
  const router = Router()

  // GET /api/items/lookup?barcode=0123456789012[&itemCode=ITEM-1]
  router.get('/lookup', async (req, res) => {
    const barcode = validateBarcode(req.query.barcode)
    if (!barcode.ok) throw new AppError('INVALID_BARCODE', 400, barcode.message)

    let itemCode: string | undefined
    if (req.query.itemCode !== undefined) {
      const parsed = validateItemCode(req.query.itemCode)
      if (!parsed.ok) throw new AppError('INVALID_ITEM_CODE', 400, parsed.message)
      itemCode = parsed.value
    }

    const started = Date.now()
    try {
      const product = await lookupService.lookup({ barcode: barcode.value, itemCode })
      logger.info('lookup', {
        requestId: res.locals.requestId,
        userId: res.locals.userId,
        outcome: 'found',
        matchedBy: product.matchedBy,
        price: product.price.status === 'available' ? 'available' : product.price.reason,
        ms: Date.now() - started,
      })
      res.setHeader('Cache-Control', 'no-store')
      const body: ApiSuccess<Product> = { success: true, data: product }
      res.json(body)
    } catch (error) {
      logger.info('lookup', {
        requestId: res.locals.requestId,
        userId: res.locals.userId,
        outcome: error instanceof AppError ? error.code : 'error',
        ms: Date.now() - started,
      })
      throw error
    }
  })

  // GET /api/items/image?itemCode=ITEM-1 — streams the Item's own image from ERPNext (auth required
  // there for private files), so ERPNext is never exposed to the browser.
  router.get('/image', async (req, res) => {
    const itemCode = validateItemCode(req.query.itemCode)
    if (!itemCode.ok) throw new AppError('INVALID_ITEM_CODE', 400, itemCode.message)
    const image = await lookupService.getImage(itemCode.value)
    res.setHeader('Content-Type', image.contentType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    res.send(image.body)
  })

  return router
}
