import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import type { Asset, AssetType, SharingAvailability, SharedEquipment } from '@/modules/assets'
import { useSetAssetSharing } from '@/modules/assets'
import { getStockRecord, isStockType } from '@/modules/assets/inventory-groups'
import { getApiErrorMessage } from '@/api/errors'
import { Modal, FormField, FormFooter, formControlClass } from '@/components/ui'
import { SharedEquipmentSummary } from './SharedEquipmentSummary'
import { useDraftGuard } from '@/hooks/useDraftGuard'

export function AssetSharingModal({ asset, assetType, equipmentIdentifier, onClose }: { asset: Asset | null; assetType?: AssetType; equipmentIdentifier?: string; onClose: () => void }) {
    if (!asset) return null
    return <SharingForm key={asset.id} asset={asset} assetType={assetType} equipmentIdentifier={equipmentIdentifier ?? asset.id} onClose={onClose} />
}

function SharingForm({ asset, assetType, equipmentIdentifier, onClose }: { asset: Asset; assetType?: AssetType; equipmentIdentifier: string; onClose: () => void }) {
    const { t, i18n } = useTranslation()
    const mutation = useSetAssetSharing()
    const initial = {
        enabled: !!asset.is_shared,
        title: asset.sharing_title ?? '',
        quantity: asset.sharing_quantity == null ? '' : String(asset.sharing_quantity),
        capacity: asset.sharing_capacity ?? '',
        note: asset.sharing_note ?? '',
        availability: asset.sharing_availability ?? 'by_arrangement',
        availabilityNote: asset.sharing_availability_note ?? '',
        contactName: asset.sharing_contact_name ?? '',
        contactEmail: asset.sharing_contact_email ?? '',
        contactPhone: asset.sharing_contact_phone ?? '',
    }
    const [values, setValues] = useState(initial)
    const [error, setError] = useState('')
    const [quantityError, setQuantityError] = useState('')
    const [emailError, setEmailError] = useState('')
    const blocked = !!assetType?.sharing_excluded
    const changed = JSON.stringify(values) !== JSON.stringify(initial)
    const { requestClose, confirmation } = useDraftGuard({ dirty: changed, busy: mutation.isPending, onClose })
    const withdrawing = initial.enabled && !values.enabled
    const stock = isStockType(assetType) ? getStockRecord(asset, assetType) : null
    const formId = 'equipment-sharing-form'
    const numericQuantity = values.quantity.trim() === '' ? null : Number(values.quantity)
    const safeQuantity = /^\d+$/.test(values.quantity.trim()) && numericQuantity !== null && Number.isSafeInteger(numericQuantity) && numericQuantity > 0 ? numericQuantity : null
    const preview: SharedEquipment = {
        id: asset.id, tenant: asset.tenant, tenant_name: asset.tenant_name,
        asset_type_name: asset.asset_type_name, category_code: assetType?.category_code ?? '', catalog_code: assetType?.catalog_code ?? null,
        tracking_mode: stock ? 'stock' : 'individual', shared_at: null,
        sharing_title: values.title, sharing_quantity: safeQuantity, sharing_capacity: values.capacity,
        sharing_note: values.note, sharing_availability: values.availability,
        sharing_availability_note: values.availabilityNote, sharing_contact_name: values.contactName,
        sharing_contact_email: values.contactEmail, sharing_contact_phone: values.contactPhone,
    }

    function change<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
        setValues(previous => ({ ...previous, [key]: value }))
        setError('')
        setQuantityError('')
        setEmailError('')
    }

    function sharingError(failure: unknown) {
        if (isAxiosError<Record<string, unknown>>(failure) && failure.response?.data && typeof failure.response.data === 'object') {
            const labels: Record<string, string> = { sharing_quantity: 'sharingDetails.quantity', sharing_title: 'sharingDetails.title', sharing_capacity: 'sharingDetails.capacity', sharing_availability: 'sharingDetails.availabilityLabel', sharing_availability_note: 'sharingDetails.availabilityNote', sharing_note: 'inventory.publicNote', sharing_contact_name: 'sharingDetails.contactName', sharing_contact_email: 'sharingDetails.contactEmail', sharing_contact_phone: 'sharingDetails.contactPhone', is_shared: 'inventory.publishLabel' }
            const errors = Object.entries(failure.response.data).filter(([key]) => key in labels).map(([key, value]) => `${t(labels[key])}: ${Array.isArray(value) ? value.join('; ') : String(value)}`)
            if (errors.length) return errors.join(' · ')
        }
        return getApiErrorMessage(failure, t('inventory.sharingFailed'))
    }

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (mutation.isPending || !changed || (values.enabled && blocked)) return
        setError('')
        // Removing consent must work even when stock or type changes invalidated a stored offer.
        if (withdrawing) {
            try {
                await mutation.mutateAsync({ id: asset.id, is_shared: false })
                onClose()
            } catch (failure) {
                setError(sharingError(failure))
            }
            return
        }
        let invalidQuantity = ''
        if (values.quantity.trim() !== '' && safeQuantity === null) invalidQuantity = t('sharingDetails.quantityInvalid')
        else if (values.availability === 'available' && safeQuantity === null) invalidQuantity = t('sharingDetails.quantityRequired')
        else if (values.enabled && safeQuantity !== null && stock && (stock.quantity === null || safeQuantity > stock.quantity)) invalidQuantity = stock.quantity === null ? t('sharingDetails.stockUnknown') : t('sharingDetails.quantityTooHigh', { count: stock.quantity })
        else if (safeQuantity !== null && !stock && safeQuantity !== 1) invalidQuantity = t('sharingDetails.individualQuantityError')
        setQuantityError(invalidQuantity)
        if (invalidQuantity) {
            document.getElementById('sharing-quantity')?.focus()
            return
        }
        if (values.contactEmail.trim() && !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(values.contactEmail.trim())) {
            setEmailError(t('sharingDetails.emailInvalid'))
            document.getElementById('sharing-contact-email')?.closest('details')?.setAttribute('open', '')
            document.getElementById('sharing-contact-email')?.focus()
            return
        }
        try {
            await mutation.mutateAsync({
                id: asset.id, is_shared: values.enabled,
                sharing_title: values.title.trim(), sharing_quantity: safeQuantity, sharing_capacity: values.capacity.trim(),
                sharing_note: values.note.trim(), sharing_availability: values.availability,
                sharing_availability_note: values.availabilityNote.trim(), sharing_contact_name: values.contactName.trim(),
                sharing_contact_email: values.contactEmail.trim(), sharing_contact_phone: values.contactPhone.trim(),
            })
            onClose()
        } catch (failure) {
            setError(sharingError(failure))
        }
    }

    return <Modal isOpen onClose={requestClose} closeDisabled={mutation.isPending} title={t('inventory.sharingTitle')} size="lg" footer={<FormFooter asSubmit formId={formId} loading={mutation.isPending} disabled={!changed || (values.enabled && blocked)} onCancel={requestClose} primaryLabel={t(withdrawing ? 'sharingDetails.withdraw' : 'common.save')} />}>
        {confirmation}
        <form id={formId} onSubmit={submit} className="space-y-6" noValidate>
            <div><h3 className="font-semibold text-slate-900 dark:text-white [overflow-wrap:anywhere]">{equipmentIdentifier}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{asset.asset_type_name} · {asset.tenant_name}</p></div>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('inventory.sharingHelp')}</p>
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
            {(blocked || asset.sharing_needs_review) && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{t(blocked ? 'inventory.sharingBlocked' : 'sharingDetails.needsReview')}</p>}
            <fieldset disabled={mutation.isPending} className="min-w-0 space-y-6">
                <label className="flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm dark:border-slate-600 dark:bg-slate-800/40">
                    <input type="checkbox" checked={values.enabled} disabled={blocked && !values.enabled} onChange={event => change('enabled', event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                    <span><span className="block font-medium text-slate-800 dark:text-slate-200">{t('inventory.publishLabel')}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{t(withdrawing ? 'sharingDetails.withdrawHelp' : values.enabled ? 'sharingDetails.publishHelp' : 'sharingDetails.draftHelp')}</span></span>
                </label>
                <fieldset disabled={withdrawing} className="min-w-0 space-y-6">
                <section className="space-y-4" aria-labelledby="sharing-public-details">
                    <h4 id="sharing-public-details" className="text-sm font-semibold text-slate-900 dark:text-white">{t('sharingDetails.offerHeading')}</h4>
                    <FormField label={t('sharingDetails.title')} help={t('sharingDetails.titleHelp')}>
                        <input className={formControlClass} maxLength={160} value={values.title} onChange={event => change('title', event.target.value)} placeholder={asset.asset_type_name} />
                    </FormField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField htmlFor="sharing-quantity" label={t('sharingDetails.quantity')} error={quantityError || undefined} help={stock ? t('sharingDetails.stockQuantityHelp', { quantity: stock.quantity === null ? t('inventory.quantityUnknown') : stock.quantity.toLocaleString(i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US') }) : t('sharingDetails.individualQuantityHelp')}>
                            <input className={formControlClass} type="text" inputMode="numeric" maxLength={16} value={values.quantity} onChange={event => change('quantity', event.target.value)} placeholder={t('sharingDetails.optionalQuantity')} />
                        </FormField>
                        <FormField label={t('sharingDetails.capacity')} help={t('sharingDetails.capacityHelp')}>
                            <input className={formControlClass} maxLength={160} value={values.capacity} onChange={event => change('capacity', event.target.value)} placeholder={t('sharingDetails.capacityPlaceholder')} />
                        </FormField>
                    </div>
                </section>
                <section className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700" aria-labelledby="sharing-availability">
                    <h4 id="sharing-availability" className="text-sm font-semibold text-slate-900 dark:text-white">{t('sharingDetails.availabilityHeading')}</h4>
                    <FormField label={t('sharingDetails.availabilityLabel')} help={t('sharingDetails.availabilityHelp')}>
                        <select className={formControlClass} value={values.availability} onChange={event => change('availability', event.target.value as SharingAvailability)}>
                            {(['by_arrangement', 'available', 'unavailable'] as const).map(value => <option key={value} value={value}>{t(`sharingDetails.availability.${value}`)}</option>)}
                        </select>
                    </FormField>
                    <FormField label={t('sharingDetails.availabilityNote')}>
                        <input className={formControlClass} maxLength={255} value={values.availabilityNote} onChange={event => change('availabilityNote', event.target.value)} placeholder={t('sharingDetails.availabilityNotePlaceholder')} />
                    </FormField>
                    <FormField label={t('inventory.publicNote')} help={t('sharingDetails.conditionsHelp')}>
                        <textarea className={formControlClass} rows={3} maxLength={1000} value={values.note} onChange={event => change('note', event.target.value)} placeholder={t('inventory.publicNotePlaceholder')} />
                    </FormField>
                </section>
                <details className="rounded-md border border-slate-200 px-4 py-3 dark:border-slate-700">
                    <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">{t('sharingDetails.contactOptional')}</summary>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('sharingDetails.contactPublicHelp')}</p>
                    <div className="mt-4 space-y-4">
                        <FormField label={t('sharingDetails.contactName')}><input className={formControlClass} maxLength={120} value={values.contactName} onChange={event => change('contactName', event.target.value)} /></FormField>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField htmlFor="sharing-contact-email" label={t('sharingDetails.contactEmail')} error={emailError || undefined}><input className={formControlClass} type="email" maxLength={254} value={values.contactEmail} onChange={event => change('contactEmail', event.target.value)} /></FormField>
                            <FormField label={t('sharingDetails.contactPhone')}><input className={formControlClass} type="tel" maxLength={40} value={values.contactPhone} onChange={event => change('contactPhone', event.target.value)} /></FormField>
                        </div>
                    </div>
                </details>
                </fieldset>
            </fieldset>
            <section aria-label={t('sharingDetails.preview')} className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h4 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{t('sharingDetails.preview')}</h4>
                <p className="mb-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('sharingDetails.previewHelp')}</p>
                <SharedEquipmentSummary equipment={preview} detailed />
            </section>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('inventory.publicationIsNotAvailability')}</p>
        </form>
    </Modal>
}
