import { useState, useEffect } from 'react'
import { Save, MapPin, Phone, Mail } from 'lucide-react'
import type { Tenant, TenantUpdateInput } from '@/modules/tenants'
import { Modal } from '@/components/ui/Modal'
import { useTranslation } from 'react-i18next'

export function TenantFormModal({
    isOpen,
    onClose,
    tenant,
    onSave,
    isLoading,
    saveError = null,
}: {
    isOpen: boolean;
    onClose: () => void;
    tenant: Tenant | null;
    onSave: (data: TenantUpdateInput) => void;
    isLoading: boolean;
    saveError?: string | null;
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
        if (isOpen) {
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
        }
    }, [tenant, isOpen])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.name?.trim()) return
        onSave(formData)
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={tenant ? t('tenants.editTenant') : t('tenants.addNew')}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        {t('tenants.tenantName')} <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                        placeholder={t('tenants.tenantNamePlaceholder')}
                        required
                        autoFocus
                    />
                </div>

                <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        {t('tenants.descriptionLabel')}
                    </label>
                    <textarea
                        value={formData.description || ''}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={3}
                        placeholder={t('tenants.descriptionPlaceholder')}
                    />
                </div>

                <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                        <MapPin size={14} className="inline mr-1" />
                        {t('tenants.addressLabel')}
                    </label>
                    <textarea
                        value={formData.address || ''}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={2}
                        placeholder={t('tenants.addressPlaceholder')}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                            <Phone size={14} className="inline mr-1" />
                            {t('tenants.phoneLabel')}
                        </label>
                        <input
                            type="tel"
                            value={formData.phone || ''}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder={t('tenants.phonePlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                            <Mail size={14} className="inline mr-1" />
                            {t('tenants.emailLabel')}
                        </label>
                        <input
                            type="email"
                            value={formData.email || ''}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder={t('tenants.emailPlaceholder')}
                        />
                    </div>
                </div>

                {saveError && (
                    <div
                        className="p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm"
                        role="alert"
                    >
                        {saveError}
                    </div>
                )}

                <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="submit"
                        disabled={isLoading || !formData.name?.trim()}
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                            <>
                                <Save size={18} />
                                {tenant ? t('tenants.update') : t('common.create')}
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium"
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
