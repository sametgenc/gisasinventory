import { useTranslation } from 'react-i18next'
import { Building2 } from 'lucide-react'
import type { SharedEquipment } from '@/modules/assets'

/** Reused for owner preview and the shared list; accepts only the public contract. */
export function SharedEquipmentSummary({ equipment, detailed = false }: { equipment: SharedEquipment; detailed?: boolean }) {
    const { t, i18n } = useTranslation()
    const availability = equipment.sharing_availability === 'available' || equipment.sharing_availability === 'unavailable'
        ? equipment.sharing_availability : 'by_arrangement'
    const quantity = Number.isSafeInteger(equipment.sharing_quantity) && (equipment.sharing_quantity ?? 0) > 0
        ? equipment.sharing_quantity : null
    const publishedAt = equipment.shared_at ? new Date(equipment.shared_at) : null
    const email = equipment.sharing_contact_email?.trim() ?? ''
    const emailHref = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? `mailto:${encodeURIComponent(email)}` : undefined
    const phone = equipment.sharing_contact_phone?.trim() ?? ''
    const normalizedPhone = phone.replace(/[\s()-]/g, '')
    const phoneHref = phone.length <= 40 && /^\+?\d{3,20}$/.test(normalizedPhone) ? `tel:${normalizedPhone}` : undefined
    const hasContact = !!(equipment.sharing_contact_name || email || phone)
    const linkClass = 'rounded-sm text-blue-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-200 [overflow-wrap:anywhere]'

    return <div className="min-w-0 space-y-4">
        <div>
            <p className="mb-2 flex items-start gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <Building2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" />
                <span className="[overflow-wrap:anywhere]">{equipment.tenant_name}</span>
            </p>
            <h3 className="text-lg font-semibold leading-7 text-slate-900 dark:text-slate-100 [overflow-wrap:anywhere]">{equipment.sharing_title?.trim() || equipment.asset_type_name}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">{[equipment.asset_type_name, equipment.category_code ? t(`catalog.categories.${equipment.category_code}`) : '', equipment.catalog_code].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${availability === 'available' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : availability === 'unavailable' ? 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200'}`}>{t(`sharingDetails.availability.${availability}`)}</span>
            <span className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-200">{quantity === null ? t('sharingDetails.quantityNotDeclared') : t('sharingDetails.offeredQuantity', { quantity: quantity?.toLocaleString(i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US') })}</span>
        </div>
        {equipment.sharing_capacity && <p className="text-sm leading-6 text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]"><span className="font-medium">{t('sharingDetails.capacity')}: </span>{equipment.sharing_capacity}</p>}
        {detailed && equipment.sharing_availability_note && <div><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('sharingDetails.availabilityNote')}</h4><p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">{equipment.sharing_availability_note}</p></div>}
        <div>
            {detailed && <h4 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{t('sharingDetails.conditions')}</h4>}
            <p className={`${detailed ? 'whitespace-pre-line' : 'line-clamp-3'} text-sm leading-6 text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]`}>{equipment.sharing_note || t('sharedEquipment.noNote')}</p>
        </div>
        {detailed && <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('sharingDetails.contact')}</h4>
            {hasContact ? <div className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                {equipment.sharing_contact_name && <p>{equipment.sharing_contact_name}</p>}
                {email && <p>{emailHref ? <a href={emailHref} className={linkClass}>{email}</a> : email}</p>}
                {phone && <p>{phoneHref ? <a href={phoneHref} className={linkClass}>{phone}</a> : phone}</p>}
            </div> : <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{t('sharingDetails.noContact')}</p>}
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('sharingDetails.contactHelp')}</p>
        </div>}
        {detailed && publishedAt && !Number.isNaN(publishedAt.getTime()) && <p className="text-xs text-slate-500 dark:text-slate-400">{t('sharedEquipment.publishedAt')}: <time dateTime={equipment.shared_at ?? undefined}>{publishedAt.toLocaleDateString(i18n.language.startsWith('tr') ? 'tr-TR' : 'en-US')}</time></p>}
    </div>
}
