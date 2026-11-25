/**
 * ERPNext integration self-check (read-only). Does not need Clerk keys.
 *
 *   npm run check:erpnext                 # connectivity, schema, price list, item-group scope
 *   npm run check:erpnext -- <barcode>    # ...plus a full lookup exactly as the API performs it
 *
 * Prints no credentials. Product output is the same normalized object the browser receives.
 */
import '../loadEnv.js'
import { ConfigError, loadErpNextConfig } from '../config.js'
import { createErpNextClient, ErpNextError } from '../erpnext/client.js'
import { createItemGroupScope } from '../erpnext/itemGroups.js'
import { createPricingService } from '../erpnext/pricing.js'
import { createProductLookupService } from '../erpnext/productLookup.js'
import { createSchemaService } from '../erpnext/schema.js'
import { AppError } from '../http/errors.js'
import { createLogger } from '../logger.js'

const ok = (msg: string) => console.log(`  ✔ ${msg}`)
const warn = (msg: string) => console.log(`  ! ${msg}`)
const fail = (msg: string) => console.log(`  ✘ ${msg}`)

async function main() {
  let config
  try {
    config = loadErpNextConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const logger = createLogger('warn')
  const client = createErpNextClient({ ...config })
  console.log(`ERPNext: ${config.baseUrl}`)

  console.log('\nConnection')
  try {
    const me = await client.callGetMethod<{ message?: string }>('frappe.auth.get_logged_user')
    ok(`authenticated as integration user "${me.message}"`)
    if (me.message === 'Administrator') warn('use a dedicated read-only integration user instead of Administrator')
  } catch (error) {
    fail(error instanceof ErpNextError ? `${error.kind}: ${error.message}` : String(error))
    process.exit(1)
  }

  console.log('\nSchema')
  const schema = await createSchemaService(client, logger).get()
  if (schema.source === 'metadata') ok(`read live metadata: barcodes in "${schema.barcodeDoctype}" (Item.${schema.barcodeTableField})`)
  else warn('could not read DocType metadata; using the standard ERPNext schema')
  ok(`Item Barcode fields: ${[...schema.barcodeFields].join(', ')}`)
  for (const field of config.metadataFields) {
    if (schema.source === 'metadata' && !schema.itemFields.has(field)) warn(`ITEM_METADATA_FIELDS: "${field}" does not exist on Item`)
  }

  console.log('\nBarcodes')
  try {
    const withBarcodes = await client.getList<{ name: string }>('Item', {
      fields: ['name'],
      filters: [[schema.barcodeDoctype, 'barcode', 'is', 'set']],
      limit: 0,
    })
    if (withBarcodes.length === 0) warn('no Item has a barcode yet — every scan will be "not found" until barcodes are added')
    else ok(`${withBarcodes.length} item(s) have at least one barcode`)
  } catch {
    warn('could not count items with barcodes')
  }
  if (config.matchItemCode) warn('LOOKUP_MATCH_ITEM_CODE=true: exact Item Code matches are used when no barcode matches')

  console.log('\nSelling price list')
  try {
    const pl = await client.getDoc<{ currency?: string; enabled?: number; selling?: number; buying?: number }>('Price List', config.priceList)
    const state = `currency ${pl.currency}, enabled=${pl.enabled}, selling=${pl.selling}, buying=${pl.buying}`
    if (pl.enabled !== 1) fail(`"${config.priceList}" is disabled (${state})`)
    else if (pl.selling !== 1) fail(`"${config.priceList}" is not a selling price list (${state})`)
    else if (pl.buying === 1 && !config.allowBuyingPriceList) fail(`"${config.priceList}" is also a buying list — prices are withheld (${state})`)
    else ok(`"${config.priceList}" (${state})`)
    const prices = await client.getList<{ name: string }>('Item Price', {
      fields: ['name'],
      filters: [['price_list', '=', config.priceList]],
      limit: 0,
    })
    ok(`${prices.length} Item Price record(s) in this list`)
  } catch (error) {
    if (error instanceof ErpNextError && error.kind === 'not_found') fail(`price list "${config.priceList}" does not exist`)
    else warn(`could not read the price list (${error instanceof ErpNextError ? error.kind : 'error'})`)
  }

  console.log('\nCompany scope')
  if (!config.company) warn('not restricted (ERPNEXT_COMPANY empty) — Items of every company can be looked up')
  else {
    try {
      const companyItems = await client.getList<{ name: string }>('Item', {
        fields: ['name'],
        filters: [['Item Default', 'company', '=', config.company]],
        limit: 0,
      })
      ok(`${companyItems.length} Item(s) have an Item Default row for "${config.company}"`)
      if (config.companyItemGroup) {
        const scope = createItemGroupScope(client, [config.companyItemGroup], logger)
        const noDefaults = await client.getList<{ name: string; item_group?: string | null }>('Item', {
          fields: ['name', 'item_group'],
          filters: [['Item Default', 'company', 'is', 'not set']],
          limit: 0,
        })
        let adopted = 0
        for (const row of noDefaults) if (await scope.isAllowed(row.item_group ?? null)) adopted++
        ok(`+ ${adopted} Item(s) with no Item Defaults inside the "${config.companyItemGroup}" item-group tree`)
        if (companyItems.length + adopted === 0) fail('no Item belongs to the company — check ERPNEXT_COMPANY (every lookup will be "not found")')
      } else if (companyItems.length === 0) {
        fail(`no Item belongs to company "${config.company}" — check the name (every lookup will be "not found")`)
      }
      ok('Items of other companies are invisible (reported as "not found")')
    } catch (error) {
      fail(`could not apply the company filter (${error instanceof ErpNextError ? error.kind : 'error'})`)
    }
  }

  console.log('\nItem-group scope')
  if (config.itemGroups.length === 0) ok('not restricted (ERPNEXT_ITEM_GROUPS empty)')
  else ok(`restricted to: ${config.itemGroups.join(', ')} (and their sub-groups)`)

  const barcode = process.argv[2]
  if (barcode !== undefined) {
    console.log(`\nLookup "${barcode}"`)
    const lookup = createProductLookupService({
      client,
      schema: createSchemaService(client, logger),
      pricing: createPricingService({ client, schema: createSchemaService(client, logger), logger, priceList: config.priceList, allowBuyingPriceList: config.allowBuyingPriceList }),
      scope: createItemGroupScope(client, config.itemGroups, logger),
      companyGroups: createItemGroupScope(client, config.companyItemGroup ? [config.companyItemGroup] : [], logger),
      config,
      logger,
    })
    try {
      console.log(JSON.stringify(await lookup.lookup({ barcode }), null, 2))
    } catch (error) {
      if (error instanceof AppError) fail(`${error.status} ${error.code}: ${error.message}${error.candidates ? ` ${JSON.stringify(error.candidates)}` : ''}`)
      else if (error instanceof ErpNextError) fail(`${error.kind}: ${error.message}`)
      else throw error
    }
  }
}

await main()
