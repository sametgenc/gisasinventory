import { useState } from 'react'
import { useDraftGuard } from '@/hooks/useDraftGuard'
import type { Tenant, TenantUpdateInput } from '@/modules/tenants'
import {
    Modal,
    FormField,
    FormSection,
    FormFooter,
    formControlClass,
} from '@/components/ui'
import { useTranslation } from 'react-i18next'

interface TenantFormModalProps {
    isOpen: boolean
    onClose: () => void
    tenant: Tenant | null
    onSave: (data: TenantUpdateInput) => void
    isLoading: boolean
    saveError?: string | null
}

export function TenantFormModal(props: TenantFormModalProps) {
    if (!props.isOpen) return null
    return <TenantFormContent key={props.tenant?.id ?? 'new'} {...props} />
}

function TenantFormContent({ isOpen, onClose, tenant, onSave, isLoading, saveError = null }: TenantFormModalProps) {
    const { t } = useTranslation()
    const [initialData] = useState<TenantUpdateInput>(() => ({
        name: tenant?.name || '', description: tenant?.description || '',
        address: tenant?.address || '', phone: tenant?.phone || '', email: tenant?.email || '',
    }))
    const [formData, setFormData] = useState(initialData)
    const canSubmit = !!formData.name?.trim()
    const { requestClose, confirmation } = useDraftGuard({ dirty: JSON.stringify(formData) !== JSON.stringify(initialData), busy: isLoading, active: isOpen, onClose })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit || isLoading) return
        onSave(formData)
    }

    const formId = 'tenant-form'

    return (
        <Modal
            isOpen={isOpen}
            onClose={requestClose}
            closeDisabled={isLoading}
            title={tenant ? t('tenants.editTenant') : t('tenants.addNew')}
            footer={
                <FormFooter
                    asSubmit
                    formId={formId}
                    loading={isLoading}
                    disabled={!canSubmit}
                    onCancel={requestClose}
                    primaryLabel={tenant ? t('tenants.update') : t('common.create')}
                />
            }
        >
            {confirmation}
            <form id={formId} onSubmit={handleSubmit} className="space-y-5">
                <fieldset disabled={isLoading} className="min-w-0 space-y-5">
                {saveError && (
                    <div
                        className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm"
                        role="alert"
                    >
                        {saveError}
                    </div>
                )}

                <FormSection>
                    <FormField label={t('tenants.tenantName')} required>
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className={formControlClass}
                            placeholder={t('tenants.tenantNamePlaceholder')}
                            required
                            autoFocus
                        />
                    </FormField>
                    <FormField label={t('tenants.descriptionLabel')}>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className={`${formControlClass} resize-none`}
                            rows={3}
                            placeholder={t('tenants.descriptionPlaceholder')}
                        />
                    </FormField>
                </FormSection>

                <FormSection title={t('nav.settings')}>
                    <FormField label={t('tenants.addressLabel')}>
                        <textarea
                            value={formData.address || ''}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            className={`${formControlClass} resize-none`}
                            rows={2}
                            placeholder={t('tenants.addressPlaceholder')}
                        />
                    </FormField>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField label={t('tenants.phoneLabel')}>
                            <input
                                type="tel"
                                value={formData.phone || ''}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className={formControlClass}
                                placeholder={t('tenants.phonePlaceholder')}
                            />
                        </FormField>
                        <FormField label={t('tenants.emailLabel')}>
                            <input
                                type="email"
                                value={formData.email || ''}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className={formControlClass}
                                placeholder={t('tenants.emailPlaceholder')}
                            />
                        </FormField>
                    </div>
                </FormSection>
                </fieldset>
            </form>
        </Modal>
    )
}
