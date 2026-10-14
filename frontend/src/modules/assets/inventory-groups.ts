import type { Asset, AssetType, SchemaField } from './types'

export interface InventoryModelGroup {
    key: string
    assetTypeId: string
    typeName: string
    brand: string
    model: string
    name: string
    count: number
    shared: number
    ownerCount: number
    trackingMode: 'individual' | 'stock'
    recordCount: number
    materialCode: string
    materialName: string
    hasInvalidQuantity: boolean
    ownerName: string
}

export function isStockType(type?: AssetType): boolean {
    return type?.tracking_mode === 'stock'
}

/** A stock line represents material quantity, never that many individual equipment records. */
export function getStockRecord(asset: Asset, type?: AssetType) {
    const declared = (key: string) => type?.schema?.some(field => field.key === key)
    const text = (key: string) => declared(key) && typeof asset.custom_data[key] === 'string'
        ? String(asset.custom_data[key]).trim().replace(/\s+/g, ' ') : ''
    const rawQuantity = declared('quantity') ? asset.custom_data.quantity : undefined
    const number = typeof rawQuantity === 'number' ? rawQuantity
        : typeof rawQuantity === 'string' && rawQuantity.trim() !== '' ? Number(rawQuantity) : NaN
    const quantity = isStockType(type) && Number.isSafeInteger(number) && number >= 0 ? number : null
    return { materialCode: text('material_code'), materialName: text('material_name'), quantity }
}

export function getInventoryTotals(assets: Asset[], assetTypes: AssetType[]) {
    const types = new Map(assetTypes.map(type => [type.id, type]))
    let equipmentCount = 0
    let stockLineCount = 0
    let stockQuantity = 0
    let hasInvalidStock = false
    for (const asset of assets) {
        const type = types.get(asset.asset_type)
        if (!isStockType(type)) { equipmentCount += 1; continue }
        stockLineCount += 1
        const { quantity } = getStockRecord(asset, type)
        if (quantity === null || !Number.isSafeInteger(stockQuantity + quantity)) hasInvalidStock = true
        else stockQuantity += quantity
    }
    return { equipmentCount, stockLineCount, stockQuantity, hasInvalidStock }
}

export function normalizeInventoryText(value: string): string {
    // Keep group keys stable across UI languages and Turkish dotted/dotless I input.
    return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i')
}

function modelField(schema: SchemaField[], key: 'brand' | 'model'): SchemaField | undefined {
    const labels = key === 'brand' ? ['marka', 'brand', 'manufacturer', 'üretici'] : ['model']
    return schema.find(field => normalizeInventoryText(field.key) === key)
        ?? schema.find(field => labels.includes(normalizeInventoryText(field.label)))
}

function fieldValue(asset: Asset, field?: SchemaField): string {
    if (!field) return ''
    const value = asset.custom_data[field.key]
    if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ')
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function modelIdentity(asset: Asset, type?: AssetType) {
    if (isStockType(type)) {
        // Local material codes do not establish a shared identity across shipyards.
        return { brand: '', model: '', key: JSON.stringify([asset.asset_type, 'stock', asset.id]) }
    }
    const brand = fieldValue(asset, modelField(type?.schema ?? [], 'brand'))
    const model = fieldValue(asset, modelField(type?.schema ?? [], 'model'))
    return { brand, model, key: JSON.stringify([asset.asset_type, normalizeInventoryText(brand), normalizeInventoryText(model)]) }
}

/** Individual equipment uses declared model fields; each stock line retains its own identity. */
export function getEquipmentModelKey(asset: Asset, type?: AssetType): string {
    return modelIdentity(asset, type).key
}

export function getInventoryModelGroups(assets: Asset[], assetTypes: AssetType[]): InventoryModelGroup[] {
    const typeMap = new Map(assetTypes.map(type => [type.id, type]))
    const groups = new Map<string, { group: InventoryModelGroup; owners: Set<number> }>()
    for (const asset of assets) {
        const type = typeMap.get(asset.asset_type)
        const stock = isStockType(type) ? getStockRecord(asset, type) : null
        const { key, brand, model } = modelIdentity(asset, type)
        let entry = groups.get(key)
        if (!entry) {
            const typeName = type?.name || asset.asset_type_name
            const modelName = [brand, model].filter(Boolean).join(' ')
            entry = {
                group: { key, assetTypeId: asset.asset_type, typeName, brand, model,
                    name: stock ? stock.materialName || [typeName, stock.materialCode].filter(Boolean).join(' · ')
                        : [typeName, modelName].filter(Boolean).join(' · '),
                    count: 0, shared: 0, ownerCount: 0, trackingMode: stock ? 'stock' : 'individual',
                    recordCount: 0, materialCode: stock?.materialCode ?? '', materialName: stock?.materialName ?? '', hasInvalidQuantity: false,
                    ownerName: stock ? asset.tenant_name : '' },
                owners: new Set<number>(),
            }
            groups.set(key, entry)
        }
        entry.group.recordCount += 1
        if (stock) {
            if (stock.quantity === null || !Number.isSafeInteger(entry.group.count + stock.quantity)) entry.group.hasInvalidQuantity = true
            else entry.group.count += stock.quantity
        } else entry.group.count += 1
        if (asset.is_listed_for_sharing) entry.group.shared += 1
        entry.owners.add(asset.tenant)
        entry.group.ownerCount = entry.owners.size
    }
    return [...groups.values()].map(entry => entry.group)
}
