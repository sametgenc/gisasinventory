import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Layers3, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { assetsApi } from '@/modules/assets/data'
import type { AssetType, SchemaField } from '@/modules/assets/types'
import { inventoryCopy } from '@/modules/assets/inventory-copy'
import { schemaRoleKey } from '@/modules/assets/schema'
import { normalizeInventoryText } from '@/modules/assets/inventory-groups'
import { inventoryEntrySummary } from '@/modules/assets/inventory-summary'
import { Button, FormField, Modal, formControlClass } from '@/components/ui'
import { useDraftGuard } from '@/hooks/useDraftGuard'

interface Props {
    isOpen: boolean
    onClose: () => void
    assetTypes: AssetType[]
    tenants: { id: number; name: string }[]
    isSuperuser: boolean
    initialTypeId?: string | null
    onCreated: (summary: string) => void
    unavailable?: boolean
    onRetry?: () => void
    retrying?: boolean
}

interface Entry {
    id: string
    typeId: string
    quantity: string
    data: Record<string, unknown>
}

function newEntry(type?: AssetType): Entry {
    return { id: crypto.randomUUID(), typeId: type?.id ?? '', quantity: '1', data: Object.fromEntries(
        (type?.schema ?? []).flatMap(field => field.default !== undefined ? [[field.key, field.default]] : field.required && field.type === 'checkbox' ? [[field.key, false]] : []),
    ) }
}

function EquipmentPicker({ types, value, onChange, disabled }: {
    types: AssetType[]; value: string; onChange: (type: AssetType) => void; disabled: boolean
}) {
    const { i18n } = useTranslation()
    const c = inventoryCopy(i18n.language)
    const id = useId()
    const selected = types.find(type => type.id === value)
    const [open, setOpen] = useState(!selected)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const searchRef = useRef<HTMLInputElement>(null)
    const changeRef = useRef<HTMLButtonElement>(null)
    const activeOptionRef = useRef<HTMLButtonElement>(null)
    const focusOnToggle = useRef(false)
    const matches = useMemo(() => types.filter(type => normalizeInventoryText(`${type.name} ${type.catalog_code ?? ''} ${type.description}`).includes(normalizeInventoryText(query)))
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language)), [types, query, i18n.language])
    const togglePicker = (nextOpen: boolean) => { focusOnToggle.current = true; setOpen(nextOpen) }
    const choose = (type: AssetType) => { onChange(type); togglePicker(false); setQuery(''); setActive(0) }

    useEffect(() => {
        if (focusOnToggle.current) {
            (open ? searchRef.current : changeRef.current)?.focus()
            focusOnToggle.current = false
        }
        if (open) activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
    }, [open, active, query])

    if (selected && !open) return <div className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="min-w-0"><p className="text-sm font-medium leading-5 text-slate-900 dark:text-white [overflow-wrap:anywhere]">{selected.name}</p><p className="mt-0.5 text-xs leading-[18px] text-slate-500 dark:text-slate-400">{c.code}: <span className="font-mono [overflow-wrap:anywhere]">{selected.catalog_code || c.noCode}</span></p></div>
        <button ref={changeRef} type="button" disabled={disabled} onClick={() => togglePicker(true)} className="shrink-0 rounded px-1 py-1 text-xs font-medium text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">{c.change}</button>
    </div>

    return <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && selected) setOpen(false) }}>
        <label htmlFor={id} className="sr-only">{c.type}</label>
        <div className="relative"><Search size={16} aria-hidden className="absolute left-3 top-3 text-slate-400" /><input ref={searchRef} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined} value={query} disabled={disabled} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0) }} onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, matches.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
            if (event.key === 'Enter' && open) { event.preventDefault(); if (matches[active]) choose(matches[active]) }
            if (event.key === 'Escape' && selected) { event.preventDefault(); event.stopPropagation(); togglePicker(false) }
        }} placeholder={c.searchType} className={`${formControlClass} pl-9`} /></div>
        {open && <div id={`${id}-options`} role="listbox" tabIndex={-1} aria-label={c.choose} className="mt-2 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            {matches.length === 0 && <p className="px-3 py-3 text-xs leading-[18px] text-slate-500">{c.noTypes}</p>}
            {matches.map((type, index) => <button key={type.id} ref={active === index ? activeOptionRef : undefined} id={`${id}-${index}`} role="option" aria-selected={value === type.id} tabIndex={-1} type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => choose(type)} className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-blue-500 ${active === index ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}><span className="min-w-0 text-slate-800 dark:text-slate-100 [overflow-wrap:anywhere]">{type.name}</span><span className="shrink-0 font-mono text-xs text-slate-500">{type.catalog_code}</span></button>)}
        </div>}
    </div>
}

export function InventoryBatchModal(props: Props) {
    if (!props.isOpen) return null
    return <BatchContent key={props.initialTypeId ?? 'new'} {...props} />
}

function BatchContent({ onClose, assetTypes, tenants, isSuperuser, initialTypeId, onCreated, unavailable = false, onRetry, retrying = false }: Props) {
    const { t, i18n } = useTranslation()
    const c = inventoryCopy(i18n.language)
    const formId = useId()
    const [entries, setEntries] = useState<Entry[]>(() => [newEntry(assetTypes.find(type => type.id === initialTypeId))])
    const [tenant, setTenant] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [conflict, setConflict] = useState(false)
    const [operationId] = useState(() => crypto.randomUUID())
    const draft = JSON.stringify({ entries: entries.map(({ typeId, quantity, data }) => ({ typeId, quantity, data })), tenant })
    const [initialDraft] = useState(draft)
    const { requestClose, confirmation } = useDraftGuard({ dirty: draft !== initialDraft, busy: saving, onClose })
    const total = entries.reduce((sum, entry) => sum + (Number.isSafeInteger(Number(entry.quantity)) ? Number(entry.quantity) : 0), 0)
    const resultSummary = inventoryEntrySummary(entries, assetTypes, i18n.language)
    const records = entries.reduce((sum, entry) => sum + (assetTypes.find(type => type.id === entry.typeId)?.tracking_mode === 'stock' ? 1 : Number(entry.quantity) || 0), 0)
    const withinLimit = entries.length <= 50 && records <= 500 && Number.isSafeInteger(total)
    const canSave = !unavailable && entries.every(entry => entry.typeId && Number.isSafeInteger(Number(entry.quantity)) && Number(entry.quantity) > 0) && (!isSuperuser || !!tenant) && withinLimit && !conflict
    const update = (id: string, value: Partial<Entry>) => setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...value } : entry))
    const setValue = (entry: Entry, key: string, value: unknown) => update(entry.id, { data: { ...entry.data, [key]: value } })
    const uniqueField = (field: SchemaField, type: AssetType) => field.is_unique_key || field.key === schemaRoleKey(type.schema, 'identifier')
    const lines = (value: unknown) => String(value ?? '').split('\n').map(item => item.trim()).filter(Boolean)

    const renderField = (entry: Entry, field: SchemaField, type: AssetType) => {
        const value = entry.data[field.key] ?? ''
        if (type.tracking_mode !== 'stock' && uniqueField(field, type) && (Number(entry.quantity) > 1 || String(value).includes('\n'))) {
            const values = lines(value)
            return <FormField key={field.key} label={field.label} required={field.required} help={`${c.perUnit}. ${values.length}/${entry.quantity} ${c.identifiers}. ${c.uniqueHelp}`}><textarea rows={3} value={String(value)} required={field.required} onChange={event => setValue(entry, field.key, event.target.value)} className={formControlClass} /></FormField>
        }
        if (field.type === 'checkbox') return <FormField key={field.key} label={field.label} required={field.required}><input type="checkbox" checked={!!value} onChange={event => setValue(entry, field.key, event.target.checked)} className="h-5 w-5 accent-blue-600" /></FormField>
        if (field.type === 'select') return <FormField key={field.key} label={field.label} required={field.required}><select value={String(value)} required={field.required} className={formControlClass} onChange={event => setValue(entry, field.key, event.target.value)}><option value="">—</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select></FormField>
        return <FormField key={field.key} label={field.label} required={field.required}><input type={field.type === 'phone' ? 'tel' : field.type === 'text' ? 'text' : field.type} value={String(value)} required={field.required} step={field.type === 'number' ? 'any' : undefined} onChange={event => setValue(entry, field.key, event.target.value)} className={formControlClass} /></FormField>
    }

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (saving || !canSave) return
        setError('')
        const rows: { asset_type: string; quantity: number; custom_data: Record<string, unknown>; tenant?: number }[] = []
        const origins: { line: number; type: AssetType }[] = []
        for (const [entryIndex, entry] of entries.entries()) {
            const type = assetTypes.find(item => item.id === entry.typeId)
            if (!type) { setError(c.invalid); return }
            const stock = type.tracking_mode === 'stock'
            const quantityKey = schemaRoleKey(type.schema, 'quantity')
            if (stock && !quantityKey) { setError(c.missingQuantity); return }
            const data = Object.fromEntries(type.schema.filter(field => !(stock && field.key === quantityKey) && entry.data[field.key] !== '' && entry.data[field.key] !== undefined).map(field => [field.key, entry.data[field.key]]))
            const unitFields = type.schema.filter(field => !stock && uniqueField(field, type) && String(data[field.key] ?? '').trim() !== '')
            if (unitFields.some(field => { const values = lines(data[field.key]); return values.length !== Number(entry.quantity) || new Set(values).size !== values.length })) { setError(c.duplicate); return }
            const base = { asset_type: type.id, ...(isSuperuser ? { tenant: Number(tenant) } : {}) }
            if (unitFields.length) {
                for (let index = 0; index < Number(entry.quantity); index++) {
                    rows.push({ ...base, quantity: 1, custom_data: { ...data, ...Object.fromEntries(unitFields.map(field => [field.key, lines(data[field.key])[index]])) } })
                    origins.push({ line: entryIndex + 1, type })
                }
            } else {
                rows.push({ ...base, quantity: Number(entry.quantity), custom_data: data })
                origins.push({ line: entryIndex + 1, type })
            }
        }
        // Per-unit identifiers share the same record limit as quantity expansion.
        if (rows.length > 500) { setError(c.limit); return }
        setSaving(true)
        try {
            await assetsApi.batchCreate({ operation_id: operationId, rows })
            onCreated(`${c.succeeded}: ${resultSummary}`)
            onClose()
        } catch (cause) {
            const response = (cause as { response?: { status?: number; data?: { detail?: string; rows?: { row: number; errors: unknown }[] } } }).response
            if (response?.status === 409) { setConflict(true); setError(c.conflict) }
            else {
                const messages = (value: unknown, type?: AssetType): string[] => {
                    if (typeof value === 'string') return [value]
                    if (Array.isArray(value)) return value.flatMap(item => messages(item, type))
                    if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, detail]) => {
                        const label = type?.schema.find(field => field.key === key)?.label
                        const text = messages(detail, type).join(' ')
                        return label ? [`${label}: ${text}`] : [text]
                    })
                    return []
                }
                setError([response?.data?.detail || c.failed, ...new Set((response?.data?.rows ?? []).map(row => {
                    const origin = origins[row.row - 1]
                    return `${c.row} ${origin?.line ?? row.row}: ${messages(row.errors, origin?.type).join(' ')}`
                }))].join(' '))
            }
        } finally { setSaving(false) }
    }

    return <Modal isOpen onClose={requestClose} title={c.quickTitle} size="xl" density="compact" closeDisabled={saving} footer={<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div aria-live="polite" className="text-xs leading-[18px] text-slate-600 dark:text-slate-300"><span className="font-medium text-slate-900 dark:text-white">{resultSummary}</span></div><div className="flex gap-2"><Button variant="secondary" disabled={saving} onClick={requestClose}>{c.cancel}</Button><Button type="submit" form={formId} loading={saving} disabled={!canSave} icon={<Check size={16} />}>{c.save}</Button></div></div>}>
        {confirmation}
        <form id={formId} onSubmit={submit} className="space-y-4">
            {unavailable && <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p>{t('common.draftDataUnavailable')}</p>{onRetry && <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry} disabled={retrying || saving}>{t('sharedEquipment.retry')}</Button>}</div>}
            <p className="max-w-2xl text-xs leading-[18px] text-slate-600 dark:text-slate-300">{c.quickHelp}</p>
            <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-[18px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><ShieldCheck size={16} className="mt-0.5 shrink-0" /><div>{c.codeOwnership}<br />{c.autoCode}</div></div>
            {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
            <fieldset disabled={saving || conflict || unavailable} className="min-w-0 space-y-3">
                {isSuperuser && <FormField label={c.tenant} required><select className={formControlClass} value={tenant} onChange={event => setTenant(event.target.value)} required><option value="">{c.tenantPlaceholder}</option>{tenants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>}
                {entries.map((entry, index) => {
                    const type = assetTypes.find(item => item.id === entry.typeId)
                    const stock = type?.tracking_mode === 'stock'
                    const quantityKey = stock ? schemaRoleKey(type.schema, 'quantity') : undefined
                    const required = type?.schema.filter(field => field.required && field.key !== quantityKey) ?? []
                    const optional = type?.schema.filter(field => !field.required && field.key !== quantityKey) ?? []
                    return <section key={entry.id} aria-label={`${c.row} ${index + 1}`} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-3 py-1 dark:border-slate-700 dark:bg-slate-800/40"><span className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300"><Layers3 size={14} />{c.row} {String(index + 1).padStart(2, '0')}</span><button type="button" aria-label={`${c.remove} ${index + 1}`} disabled={entries.length === 1} onClick={() => setEntries(current => current.filter(item => item.id !== entry.id))} className="rounded p-2 text-slate-500 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"><Trash2 size={15} /></button></div>
                        <div className="space-y-3 p-3"><div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]"><div className="min-w-0"><p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{c.type}</p><EquipmentPicker types={assetTypes} value={entry.typeId} disabled={saving || conflict} onChange={selected => update(entry.id, { typeId: selected.id, data: newEntry(selected).data })} /></div><FormField label={c.quantity} required><input type="number" min={1} max={stock ? Number.MAX_SAFE_INTEGER : 500} step={1} inputMode="numeric" value={entry.quantity} onChange={event => update(entry.id, { quantity: event.target.value })} required className={`${formControlClass} font-medium tabular-nums`} /></FormField></div>
                            {type && <><p className="text-xs leading-[18px] text-slate-500 dark:text-slate-400">{stock ? c.stockRow : c.individual}</p>{stock && !quantityKey && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{c.missingQuantity}</p>}
                                {required.length > 0 && <div className="space-y-2"><p className="text-xs font-medium leading-[18px] text-slate-700 dark:text-slate-200">{c.required}</p><div className="grid gap-3 sm:grid-cols-2">{required.map(field => renderField(entry, field, type))}</div></div>}
                                {optional.length > 0 && <details className="group border-t border-slate-200 pt-3 dark:border-slate-700"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"><ChevronDown size={15} className="transition-transform group-open:rotate-180" />{c.optional} <span className="text-xs font-normal text-slate-400">({optional.length})</span></summary><p className="mt-2 text-xs leading-[18px] text-slate-500 dark:text-slate-400">{c.optionalHelp}</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{optional.map(field => renderField(entry, field, type))}</div></details>}
                            </>}
                        </div>
                    </section>
                })}
                <Button variant="secondary" className="w-full border-dashed" onClick={() => setEntries(current => [...current, newEntry()])} disabled={entries.length >= 50} icon={<Plus size={16} />}>{c.addRow}</Button>
            </fieldset>
            <p className={`text-xs leading-[18px] ${withinLimit ? 'text-slate-500 dark:text-slate-400' : 'text-red-600 dark:text-red-400'}`}>{c.limit}</p>
            <p className="flex items-start gap-2 text-xs leading-[18px] text-slate-500 dark:text-slate-400"><ShieldCheck size={15} className="mt-0.5 shrink-0" />{c.privateHelp}</p>
        </form>
    </Modal>
}
