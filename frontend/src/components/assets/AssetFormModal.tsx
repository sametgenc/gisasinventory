import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset, AssetType, SchemaField } from '@/modules/assets'
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
}

/**
 * Unified Asset form modal for create and edit flows.
 * In edit mode the asset type is locked; only custom_data (and tenant for superuser) is editable.
 */
export function AssetFormModal({
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
}: AssetFormModalProps) {
    const { t } = useTranslation()
    const [selectedTypeId, setSelectedTypeId] = useState('')
    const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null)
    const [formData, setFormData] = useState<Record<string, unknown>>({})

    useEffect(() => {
        if (!isOpen) return
        if (mode === 'edit' && asset) {
            setSelectedTypeId(asset.asset_type)
            setSelectedTenantId(asset.tenant ?? null)
            setFormData({ ...(asset.custom_data || {}) })
        } else {
            setSelectedTypeId('')
            setSelectedTenantId(null)
            setFormData({})
        }
    }, [isOpen, mode, asset])

    const selectedType = useMemo(
        () => assetTypes.find((at) => at.id === selectedTypeId),
        [assetTypes, selectedTypeId],
    )

    const canSubmit = !!selectedTypeId && (!isSuperuser || !!selectedTenantId)

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return
        const payload: AssetFormPayload = {
            asset_type: selectedTypeId,
            custom_data: formData,
        }
        if (isSuperuser && selectedTenantId) payload.tenant = selectedTenantId
        onSave(payload)
    }

    const setFieldValue = (key: string, value: unknown) =>
        setFormData((prev) => ({ ...prev, [key]: value }))

    const renderField = (field: SchemaField) => {
        const value = formData[field.key] ?? ''

        if (field.type === 'checkbox') {
            return (
                <FormField key={field.key} label={field.label} required={field.required}>
                    <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700">
                        <input
                            type="checkbox"
                            checked={!!value}
                            onChange={(e) => setFieldValue(field.key, e.target.checked)}
                            className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{t('common.yes')}</span>
                    </label>
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
            <FormField key={field.key} label={field.label} required={field.required}>
                <input
                    type={inputType}
                    value={value as string}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                    className={formControlClass}
                    placeholder={t('assets.enterField', { field: field.label })}
                    required={field.required}
                />
            </FormField>
        )
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? t('assets.editAsset') : t('assets.createAsset')}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <FormSection title={t('assets.fields.generalInfo')} layout={isSuperuser ? 'grid' : 'stack'}>
                    <FormField label={t('assets.typeLabel')} required>
                        <select
                            value={selectedTypeId}
                            onChange={(e) => {
                                setSelectedTypeId(e.target.value)
                                if (mode === 'create') setFormData({})
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
                        title={t('assets.fields.customFields')}
                        description={selectedType.name}
                        layout="grid"
                    >
                        {(selectedType.schema || []).map(renderField)}
                    </FormSection>
                )}

                <FormFooter
                    asSubmit
                    loading={isLoading}
                    disabled={!canSubmit}
                    onCancel={onClose}
                    primaryLabel={mode === 'edit' ? t('common.save') : t('common.create')}
                />
            </form>
        </Modal>
    )
}
