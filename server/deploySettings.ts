/**
 * Business settings for the hosted (Netlify) deployment of the Al Isnad scanner.
 *
 * These are decisions made by the owner, not secrets, so they are versioned with the code and
 * TAKE PRECEDENCE over the Netlify dashboard. That way a stale dashboard value (for example a
 * leftover "Standard Selling") can never put the wrong price on screen.
 *
 * Secrets — ERPNEXT_API_KEY, ERPNEXT_API_SECRET, CLERK_SECRET_KEY — and the ERPNext URL stay in
 * the Netlify dashboard and are never written here.
 *
 * To change a setting: edit it here, commit and push (Netlify redeploys).
 */
export const NETLIFY_BUSINESS_SETTINGS: Readonly<Record<string, string>> = {
  // Only الاسناد's items are visible (Item Defaults → company, or the الاسناد item-group tree).
  ERPNEXT_COMPANY: 'الاسناد',
  ERPNEXT_COMPANY_ITEM_GROUP: 'الاسناد',
  // Selling prices come from the الاسناد price list (confirmed by the owner on 2026-11-25). It is
  // flagged as both buying and selling in ERPNext, so that has to be allowed explicitly.
  ERPNEXT_PRICE_LIST: 'الاسناد',
  ERPNEXT_ALLOW_BUYING_PRICE_LIST: 'true',
  // Product title: Arabic name, then the Display Name, then ERPNext's item_name.
  ITEM_NAME_FIELDS: 'custom_arabic_item_name,custom_srep_display_name,item_name',
  ITEM_METADATA_FIELDS: 'custom_category,custom_sub_category,custom_device_color,custom_device_storage,custom_device_ram,country_of_origin,warranty_period',
  // Until every item has a barcode, an exact Item Code also finds the product.
  LOOKUP_MATCH_ITEM_CODE: 'true',
  DISABLED_ITEM_POLICY: 'warn',
}
