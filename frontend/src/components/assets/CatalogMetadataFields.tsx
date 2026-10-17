import { useTranslation } from 'react-i18next'
import { FormField, formControlClass } from '@/components/ui'
import { categoryCodes } from '@/modules/assets/catalog'
import { getCatalogCopy } from '@/modules/assets/catalog-copy'
import type { CatalogMetadata } from '@/modules/assets/types'

export function CatalogMetadataFields({ value, onChange }: {
    value: CatalogMetadata
    onChange: (value: CatalogMetadata) => void
}) {
    const { t, i18n } = useTranslation()
    const copy = getCatalogCopy(i18n.language)
    const autoExcluded = value.category_code === 'K' || value.sharing_class === 'C'
    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={copy.catalogCode} help={copy.catalogCodeHelp}>
                    <input className={formControlClass} maxLength={64} value={value.catalog_code || ''}
                        placeholder="B-001" onChange={e => onChange({ catalog_code: e.target.value.toUpperCase() })} />
                </FormField>
                <FormField label={t('catalog.category')}>
                    <select className={formControlClass} value={value.category_code || ''}
                        onChange={e => onChange({ category_code: e.target.value })}>
                        <option value="">{t('catalog.unclassified')}</option>
                        {categoryCodes.map(code => <option key={code} value={code}>{code} · {t(`catalog.categories.${code}`)}</option>)}
                    </select>
                </FormField>
            </div>
            <details className="rounded-md border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">{copy.assessment}</summary>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.assessmentHelp}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <FormField label={t('catalog.grade')}>
                        <select className={formControlClass} value={value.sharing_class || ''}
                            onChange={e => onChange({ sharing_class: e.target.value as CatalogMetadata['sharing_class'] })}>
                            <option value="">{t('catalog.unclassified')}</option>
                            {(['A', 'B', 'C'] as const).map(code => <option key={code} value={code}>{t(`catalog.grades.${code}`)}</option>)}
                        </select>
                    </FormField>
                    <FormField label={t('catalog.exclusion')} help={t('catalog.exclusionHelp')}>
                        <input className={formControlClass} maxLength={500} value={value.exclusion_reason || ''}
                            placeholder={t('catalog.exclusionPlaceholder')} onChange={e => onChange({ exclusion_reason: e.target.value })} />
                    </FormField>
                </div>
                {autoExcluded && <p role="status" className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{t('catalog.autoExcluded')}</p>}
            </details>
        </div>
    )
}
