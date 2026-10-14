import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset, AssetType } from '@/modules/assets'
import { useSetAssetSharing } from '@/modules/assets'
import { getApiErrorMessage } from '@/api/errors'
import { Modal, FormField, FormFooter, formControlClass } from '@/components/ui'

export function AssetSharingModal({ asset, assetType, equipmentIdentifier, onClose }: { asset: Asset | null; assetType?: AssetType; equipmentIdentifier?: string; onClose: () => void }) {
    if (!asset) return null
    return <SharingForm key={asset.id} asset={asset} assetType={assetType} equipmentIdentifier={equipmentIdentifier ?? asset.id} onClose={onClose} />
}

function SharingForm({ asset, assetType, equipmentIdentifier, onClose }: { asset: Asset; assetType?: AssetType; equipmentIdentifier: string; onClose: () => void }) {
    const { t } = useTranslation()
    const mutation = useSetAssetSharing()
    const [enabled, setEnabled] = useState(!!asset.is_shared)
    const [note, setNote] = useState(asset.sharing_note ?? '')
    const [error, setError] = useState('')
    const blocked = !!assetType?.sharing_excluded
    const changed = enabled !== !!asset.is_shared || note !== (asset.sharing_note ?? '')
    const formId = 'equipment-sharing-form'

    async function submit(event: React.FormEvent) {
        event.preventDefault()
        if (mutation.isPending || !changed || (enabled && blocked)) return
        setError('')
        try {
            await mutation.mutateAsync({ id: asset.id, is_shared: enabled, sharing_note: note })
            onClose()
        } catch (failure) {
            setError(getApiErrorMessage(failure, t('inventory.sharingFailed')))
        }
    }

    return <Modal isOpen onClose={onClose} closeDisabled={mutation.isPending} title={t('inventory.sharingTitle')} size="md" footer={<FormFooter asSubmit formId={formId} loading={mutation.isPending} disabled={!changed || (enabled && blocked)} onCancel={onClose} primaryLabel={t('common.save')} />}>
        <form id={formId} onSubmit={submit} className="space-y-5">
            <div><h3 className="font-semibold text-slate-900 dark:text-white [overflow-wrap:anywhere]">{equipmentIdentifier}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{asset.asset_type_name} · {asset.tenant_name}</p></div>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('inventory.sharingHelp')}</p>
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
            {blocked && <p className="text-sm text-amber-700 dark:text-amber-300">{t('inventory.sharingBlocked')}</p>}
            <fieldset disabled={mutation.isPending} className="space-y-4">
                <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                    <input type="checkbox" checked={enabled} disabled={blocked && !enabled} onChange={event => setEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">{t('inventory.publishLabel')}</span>
                </label>
                <FormField label={t('inventory.publicNote')} help={t('inventory.publicNoteHelp')}>
                    <textarea className={formControlClass} rows={4} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} placeholder={t('inventory.publicNotePlaceholder')} />
                </FormField>
            </fieldset>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('inventory.publicationIsNotAvailability')}</p>
        </form>
    </Modal>
}
