import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset, AssetType, SchemaField } from '@/modules/assets'
import { isStockType } from '@/modules/assets/inventory-groups'
import {
    Modal,
    FormField,
    FormSection,
    FormFooter,
    formControlClass,
} from '@/components/ui'

type Tenant = { id: number; name: string }

export interface AssetFormPayload {
    asset_type: string
    tenant?: number
    custom_data: Record<string, unknown>
}

export interface AssetFormModalProps {
    isOpen: boolean
    onClose: () => void
    mode: 'create' | 'edit'
    /** Required in `edit` mode. */
    asset?: Asset | null
    assetTypes: AssetType[]
    tenants: Tenant[]
    isSuperuser: boolean
    onSave: (data: AssetFormPayload) => Promise<void> | void
    isLoading: boolean
    error?: string | null
    initialTypeId?: string | null
}

/**
 * Unified Asset form modal for create and edit flows.
 * In edit mode the asset type is locked; only custom_data (and tenant for superuser) is editable.
 */
export function AssetFormModal(props: AssetFormModalProps) {
    if (!props.isOpen) return null
    return <AssetFormContent key={`${props.mode}:${props.asset?.id ?? 'new'}:${props.initialTypeId ?? ''}`} {...props} />
}

function AssetFormContent({
    isOpen,
    onClose,
    mode,
    asset,
    assetTypes,
    tenants,
    isSuperuser,
    onSave,
    isLoading,
    error,
    initialTypeId,
}: AssetFormModalProps) {
    const { t } = useTranslation()
    const initialType = mode === 'edit' ? asset?.asset_type ?? '' : initialTypeId ?? ''
    const [selectedTypeId, setSelectedTypeId] = useState(initialType)
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(mode === 'edit' ? asset?.tenant ?? null : null)
    const [formData, setFormData] = useState<Record<string, unknown>>(() => mode === 'edit' ? { ...asset?.custom_data } : Object.fromEntries((assetTypes.find(type => type.id === initialType)?.schema ?? []).flatMap(field => field.default !== undefined ? [[field.key, field.default]] : field.type === 'checkbox' ? [[field.key, false]] : [])))

    const selectedType = useMemo(
        () => assetTypes.find((at) => at.id === selectedTypeId),
        [assetTypes, selectedTypeId],
    )

    const canSubmit = !!selectedTypeId && (!isSuperuser || !!selectedTenantId)
    const stock = isStockType(selectedType)
    const stockKeys = ['material_code', 'material_name', 'quantity']
    const stockFields = stockKeys.flatMap(key => selectedType?.schema.filter(field => field.key === key) ?? [])
    const additionalFields = stock ? selectedType?.schema.filter(field => !stockKeys.includes(field.key)) ?? [] : []

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit || isLoading) return
        const payload: AssetFormPayload = {
            asset_type: selectedTypeId,
            custom_data: {
                ...Object.fromEntries((selectedType?.schema ?? []).filter(field => field.type === 'checkbox').map(field => [field.key, false])),
                ...formData,
            },
        }
        if (isSuperuser && selectedTenantId) payload.tenant = selectedTenantId
        onSave(payload)
    }

    const setFieldValue = (key: string, value: unknown) =>
        setFormData((prev) => ({ ...prev, [key]: value }))

    const renderField = (field: SchemaField) => {
        const value = formData[field.key] ?? ''
        const stockQuantity = stock && field.key === 'quantity'
        const label = stock ? ({ material_code: t('inventory.materialCode'), material_name: t('inventory.materialName'), quantity: t('inventory.totalStock') } as Record<string, string>)[field.key] || field.label : field.label

        if (field.type === 'checkbox') {
            return (
                <FormField key={field.key} label={field.label} required={field.required} help={t('ux.checkboxHelp')}>
                    <input type="checkbox" checked={!!value} onChange={e => setFieldValue(field.key, e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                </FormField>
            )
        }

        if (field.type === 'select') {
            return (
                <FormField key={field.key} label={field.label} required={field.required}>
                    <select
                        value={value as string}
                        onChange={(e) => setFieldValue(field.key, e.target.value)}
                        className={formControlClass}
                        required={field.required}
                    >
                        <option value="">{t('assets.selectPlaceholder')}</option>
                        {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                                {opt}
                            </option>
                        ))}
                    </select>
                </FormField>
            )
        }

        const inputType =
            field.type === 'email' ? 'email' :
            field.type === 'phone' ? 'tel' :
            field.type === 'number' ? 'number' :
            field.type === 'date' ? 'date' :
            'text'

        return (
            <FormField key={field.key} label={label} required={field.required} help={stockQuantity ? t('inventory.stockQuantityHelp') : undefined}>
                <input
                    type={inputType}
                    step={stockQuantity ? 1 : field.type === 'number' ? 'any' : undefined}
                    min={stockQuantity ? 0 : undefined}
                    max={stockQuantity ? Number.MAX_SAFE_INTEGER : undefined}
                    inputMode={stockQuantity ? 'numeric' : undefined}
                    value={value as string}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                    className={formControlClass}
                    placeholder={t('assets.enterField', { field: label })}
                    required={field.required}
                />
            </FormField>
        )
    }

    const formId = 'asset-form'

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            closeDisabled={isLoading}
            title={stock ? t(mode === 'edit' ? 'inventory.editStock' : 'inventory.createStock') : mode === 'edit' ? t('assets.editAsset') : t('assets.createAsset')}
            footer={
                <FormFooter
                    asSubmit
                    formId={formId}
                    loading={isLoading}
                    disabled={!canSubmit}
                    onCancel={onClose}
                    primaryLabel={mode === 'edit' ? t('common.save') : t('common.create')}
                />
            }
        >
            <form id={formId} onSubmit={handleSubmit} className="space-y-6">
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t(stock ? 'inventory.stockMeaning' : 'inventory.typeMeaning')}</p>
                {error && (
                    <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <fieldset disabled={isLoading} className="min-w-0 space-y-6">
                <FormSection title={t('assets.fields.generalInfo')} layout={isSuperuser ? 'grid' : 'stack'}>
                    <FormField label={t('assets.typeLabel')} required>
                        <select
                            value={selectedTypeId}
                            onChange={(e) => {
                                setSelectedTypeId(e.target.value)
                                if (mode === 'create') setFormData(Object.fromEntries((assetTypes.find(type => type.id === e.target.value)?.schema ?? []).flatMap(field => field.default !== undefined ? [[field.key, field.default]] : field.type === 'checkbox' ? [[field.key, false]] : [])))
                            }}
                            className={formControlClass}
                            required
                            disabled={mode === 'edit'}
                        >
                            <option value="">{t('assets.typePlaceholder')}</option>
                            {assetTypes.map((type) => (
                                <option key={type.id} value={type.id}>
                                    {type.name}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    {isSuperuser && (
                        <FormField label={t('assets.shipyardLabel')} required>
                            <select
                                value={selectedTenantId || ''}
                                onChange={(e) => setSelectedTenantId(e.target.value ? Number(e.target.value) : null)}
                                className={formControlClass}
                                required
                            >
                                <option value="">{t('assets.shipyardPlaceholder')}</option>
                                {tenants.map((tenant) => (
                                    <option key={tenant.id} value={tenant.id}>
                                        {tenant.name}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                    )}
                </FormSection>

                {selectedType && (selectedType.schema?.length ?? 0) > 0 && (
                    <FormSection
                        title={t(stock ? 'inventory.stockInformation' : 'assets.fields.customFields')}
                        description={selectedType.name}
                        layout="grid"
                    >
                        {(stock ? stockFields : selectedType.schema || []).map(renderField)}
                    </FormSection>
                )}
                {stock && additionalFields.length > 0 && <details className="rounded-md border border-slate-200 dark:border-slate-700">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">{t('inventory.additionalInformation')}</summary>
                    <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-700">{additionalFields.map(renderField)}</div>
                </details>}
                </fieldset>
            </form>
        </Modal>
    )
}
