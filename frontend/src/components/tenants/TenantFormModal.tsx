import { useState, useEffect } from 'react'
import type { Tenant, TenantUpdateInput } from '@/modules/tenants'
import {
    Modal,
    FormField,
    FormSection,
    FormFooter,
    formControlClass,
} from '@/components/ui'
import { useTranslation } from 'react-i18next'

export function TenantFormModal({
    isOpen,
    onClose,
    tenant,
    onSave,
    isLoading,
    saveError = null,
}: {
    isOpen: boolean
    onClose: () => void
    tenant: Tenant | null
    onSave: (data: TenantUpdateInput) => void
    isLoading: boolean
    saveError?: string | null
}) {
    const { t } = useTranslation()
    const [formData, setFormData] = useState<TenantUpdateInput>({
        name: '',
        description: '',
        address: '',
        phone: '',
        email: '',
    })

    useEffect(() => {
        if (!isOpen) return
        if (tenant) {
            setFormData({
                name: tenant.name || '',
                description: tenant.description || '',
                address: tenant.address || '',
                phone: tenant.phone || '',
                email: tenant.email || '',
            })
        } else {
            setFormData({ name: '', description: '', address: '', phone: '', email: '' })
        }
    }, [tenant, isOpen])

    const canSubmit = !!formData.name?.trim()

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return
        onSave(formData)
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={tenant ? t('tenants.editTenant') : t('tenants.addNew')}>
            <form onSubmit={handleSubmit} className="space-y-5">
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

                <FormFooter
                    asSubmit
                    loading={isLoading}
                    disabled={!canSubmit}
                    onCancel={onClose}
                    primaryLabel={tenant ? t('tenants.update') : t('common.create')}
                />
            </form>
        </Modal>
    )
}
