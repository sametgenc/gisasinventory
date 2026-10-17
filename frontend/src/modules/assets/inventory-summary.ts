import type { Asset, AssetType, SchemaField } from './types'
import { inventoryCopy } from './inventory-copy'
import { normalizeInventoryText } from './inventory-groups'

/** Record counts and stock quantities have different meanings, even within one save. */
export function inventoryEntrySummary(entries: { typeId: string; quantity: string }[], types: AssetType[], language: string): string {
    let individual = 0
    let stockRecords = 0
    let stockQuantity = 0
    for (const entry of entries) {
        const type = types.find(type => type.id === entry.typeId)
        const quantity = Number(entry.quantity)
        if (!type || !Number.isSafeInteger(quantity) || quantity <= 0) continue
        if (type.tracking_mode === 'stock') { stockRecords += 1; stockQuantity += quantity }
        else individual += quantity
    }
    const c = inventoryCopy(language)
    const format = (value: number) => value.toLocaleString(language)
    return [individual > 0 ? c.physicalResult(format(individual)) : '', stockRecords > 0 ? c.stockResult(format(stockRecords), format(stockQuantity)) : ''].filter(Boolean).join(' · ')
        || c.physicalResult(format(0))
}

const detailAliases = [
    ['serial', 'serial_number', 'serial_no', 'seri', 'seri_no', 'seri_numarasi', 'serial number', 'serial no', 'seri numarasi'],
    ['capacity', 'kapasite', 'lifting_capacity', 'load_capacity', 'kaldirma kapasitesi', 'capacity tonnes', 'capacity tons', 'capacity ton', 'capacity kg'],
    ['last_control', 'last_inspection', 'inspection_date', 'last_control_date', 'next_control', 'next_inspection', 'next_inspection_date', 'control_date', 'kontrol_tarihi', 'son_kontrol', 'son_kontrol_tarihi', 'periyodik_kontrol_tarihi', 'muayene_tarihi', 'last inspection', 'next inspection', 'kontrol tarihi', 'son kontrol tarihi', 'periyodik kontrol tarihi', 'muayene tarihi'],
]

function normalizeField(value: string) {
    return normalizeInventoryText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
}

/** Only schema-declared, recognized distinguishing fields enter compact private inventory rows. */
export function equipmentDistinguishingFields(asset: Asset, type?: AssetType): { field: SchemaField; value: string }[] {
    const matches: { field: SchemaField; value: string }[] = []
    for (const aliases of detailAliases) {
        const field = type?.schema.find(candidate => aliases.some(alias => normalizeField(candidate.key) === normalizeField(alias) || normalizeField(candidate.label) === normalizeField(alias)))
        if (!field) continue
        const value = asset.custom_data[field.key]
        if (typeof value === 'string' && value.trim()) matches.push({ field, value: value.trim() })
        else if (typeof value === 'number' && Number.isFinite(value)) matches.push({ field, value: String(value) })
    }
    return matches
}
