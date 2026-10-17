import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { InventoryBatchModal } from '../src/components/assets/InventoryBatchModal'
import { ThemeProvider } from '../src/components/ThemeProvider'
import type { AssetType } from '../src/modules/assets/types'
import '../src/i18n'
import '../src/index.css'

const base: Pick<AssetType, 'description' | 'created_at' | 'updated_at' | 'created_by' | 'tracking_mode'> = {
    description: '', created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z',
    created_by: 1, tracking_mode: 'individual',
}

// Synthetic fixtures describe behavior without exposing any shipyard's source inventory.
const assetTypes: AssetType[] = [
    { ...base, id: 'example-crane', name: 'Example crane', catalog_code: 'EX-CRANE', schema: [
        { key: 'capacity', label: 'Capacity in tonnes', type: 'number', required: false },
        { key: 'manufacturer', label: 'Manufacturer', type: 'text', required: false },
        { key: 'calibrated', label: 'Calibrated', type: 'checkbox', required: false },
    ] },
    { ...base, id: 'example-generator', name: 'Example generator', catalog_code: 'EX-GEN', schema: [] },
    { ...base, id: 'required-equipment', name: 'Equipment with required field', schema: [
        { key: 'voltage', label: 'Operating voltage', type: 'number', required: true },
        { key: 'note', label: 'Maintenance note', type: 'text', required: false },
    ] },
    { ...base, id: 'required-flag', name: 'Equipment with required boolean', schema: [
        { key: 'outdoor', label: 'Outdoor equipment', type: 'checkbox', required: true },
    ] },
    { ...base, id: 'unique-equipment', name: 'Equipment with unique serial', schema: [
        { key: 'serial', label: 'Unique serial', type: 'text', required: true, is_unique_key: true, role: 'identifier' },
    ] },
    { ...base, id: 'numeric-identifier', name: 'Equipment with numeric serial', schema: [
        { key: 'serial', label: 'Numeric serial', type: 'number', required: true, is_unique_key: true, role: 'identifier' },
    ] },
    { ...base, id: 'stock-material', name: 'Example scaffold material', tracking_mode: 'stock', schema: [
        { key: 'material_name', label: 'Material description', type: 'text', role: 'display_name' },
        { key: 'quantity', label: 'Stock quantity', type: 'number', role: 'quantity' },
    ] },
]

export function Fixture() {
    const [open, setOpen] = useState(true)
    const [saved, setSaved] = useState(false)
    const params = new URLSearchParams(window.location.search)
    return <main>
        <button type="button" onClick={() => { setOpen(true); setSaved(false) }}>Open batch entry</button>
        {saved && <p role="status">Inventory saved</p>}
        <InventoryBatchModal
            isOpen={open}
            onClose={() => setOpen(false)}
            assetTypes={assetTypes}
            tenants={[{ id: 1, name: 'Example Yard' }, { id: 2, name: 'Other Yard' }]}
            isSuperuser={params.get('global') === 'true'}
            initialTypeId={params.get('type')}
            onCreated={() => { setSaved(true); setOpen(false) }}
        />
    </main>
}

createRoot(document.getElementById('root')!).render(<ThemeProvider><Fixture /></ThemeProvider>)
