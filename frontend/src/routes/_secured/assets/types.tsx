import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
    Package, Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp,
    Layers, Type, Hash, Calendar, List, CheckSquare, Mail, Phone, GripVertical
} from 'lucide-react'
import {
    useAssetTypes, useCreateAssetType, useUpdateAssetType, useDeleteAssetType
} from '@/modules/assets'
import { useAuth } from '@/auth/context'
import type { AssetType, SchemaField, AssetTypeCreateInput } from '@/modules/assets'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/types')({
    component: AssetTypesPage,
})

const FIELD_TYPE_ICONS = {
    text: Type,
    number: Hash,
    date: Calendar,
    select: List,
    checkbox: CheckSquare,
    email: Mail,
    phone: Phone,
} as const;

interface FieldEditorProps {
    field: SchemaField;
    index: number;
    onUpdate: (index: number, updates: Partial<SchemaField>) => void;
    onRemove: (index: number) => void;
}

function FieldEditor({ field, index, onUpdate, onRemove }: FieldEditorProps) {
    const { t } = useTranslation()
    const [isExpanded, setIsExpanded] = useState(true)
    const [optionsText, setOptionsText] = useState(field.options?.join('\n') || '')

    const fieldTypeKeys = ['text', 'number', 'date', 'select', 'checkbox', 'email', 'phone'] as const

    const handleOptionsChange = (text: string) => {
        setOptionsText(text)
        const options = text.split('\n').map(o => o.trim()).filter(o => o.length > 0)
        onUpdate(index, { options })
    }

    const handleLabelChange = (label: string) => {
        const key = label
            .toLowerCase()
            .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]/gi, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
        onUpdate(index, { label, key: key || `field_${index}` })
    }

    const FieldIcon = FIELD_TYPE_ICONS[field.type as keyof typeof FIELD_TYPE_ICONS] || Type

    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800/50">
            <div
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <GripVertical size={16} className="text-slate-400 cursor-move" />
                <FieldIcon size={18} className="text-purple-500" />
                <span className="font-medium text-slate-900 dark:text-white flex-1">
                    {field.label || t('assetTypes.newField')}
                </span>
                <span className="text-xs text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                    {t(`assetTypes.fieldTypes.${field.type}`, field.type)}
                </span>
                {field.required && (
                    <span className="text-xs text-red-500">*</span>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                    <Trash2 size={14} />
                </button>
                {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>

            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-slate-100 dark:border-slate-700">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                                {t('assetTypes.fieldName')} <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={field.label}
                                onChange={(e) => handleLabelChange(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                placeholder={t('assetTypes.fieldNamePlaceholder')}
                            />
                            {field.key && (
                                <p className="text-xs text-slate-400 mt-1">{t('assetTypes.keyLabel', { key: field.key })}</p>
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                                {t('assetTypes.fieldTypeLabel')}
                            </label>
                            <select
                                value={field.type}
                                onChange={(e) => onUpdate(index, { type: e.target.value as SchemaField['type'], options: e.target.value === 'select' ? [] : undefined })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-purple-500"
                            >
                                {fieldTypeKeys.map((ftKey) => (
                                    <option key={ftKey} value={ftKey}>
                                        {t(`assetTypes.fieldTypes.${ftKey}`)} - {t(`assetTypes.fieldTypeDescriptions.${ftKey}`)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {field.type === 'select' && (
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                                {t('assetTypes.options')} <span className="text-red-500">*</span>
                                <span className="font-normal text-slate-400 ml-1">({t('assetTypes.optionsHint')})</span>
                            </label>
                            <textarea
                                value={optionsText}
                                onChange={(e) => handleOptionsChange(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-purple-500 resize-none"
                                rows={4}
                                placeholder={t('assetTypes.optionsPlaceholder')}
                            />
                            {(!field.options || field.options.length === 0) && (
                                <p className="text-xs text-amber-600 mt-1">⚠️ {t('assetTypes.optionsRequired')}</p>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={field.required || false}
                                onChange={(e) => onUpdate(index, { required: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-purple-600"></div>
                        </label>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{t('assetTypes.requiredField')}</span>
                    </div>
                </div>
            )}
        </div>
    )
}

function AssetTypesPage() {
    const { user } = useAuth()
    const { t } = useTranslation()
    const { data: assetTypes, isLoading } = useAssetTypes()
    const createMutation = useCreateAssetType()
    const updateMutation = useUpdateAssetType()
    const deleteMutation = useDeleteAssetType()

    const [selectedType, setSelectedType] = useState<AssetType | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState<AssetTypeCreateInput>({
        name: '',
        description: '',
        schema: []
    })

    const canManageTypes = user?.is_superuser

    const resetForm = () => {
        setFormData({ name: '', description: '', schema: [] })
        setIsCreating(false)
        setIsEditing(false)
        setError(null)
    }

    const startCreate = () => {
        if (!canManageTypes) {
            setError(t('assetTypes.onlyAdmins'))
            return
        }
        setSelectedType(null)
        setFormData({ name: '', description: '', schema: [] })
        setIsCreating(true)
        setIsEditing(false)
        setError(null)
    }

    const startEdit = () => {
        if (!selectedType || !canManageTypes) return
        setFormData({
            name: selectedType.name,
            description: selectedType.description || '',
            schema: selectedType.schema ? [...selectedType.schema] : []
        })
        setIsEditing(true)
        setError(null)
    }

    const validateForm = (): string | null => {
        if (!formData.name.trim()) {
            return t('assetTypes.nameRequired')
        }

        for (const field of formData.schema) {
            if (!field.label.trim()) {
                return t('assetTypes.allFieldsRequired')
            }
            if (field.type === 'select' && (!field.options || field.options.length === 0)) {
                return t('assetTypes.selectOptionsRequired', { field: field.label })
            }
        }

        return null
    }

    const handleSave = async () => {
        const validationError = validateForm()
        if (validationError) {
            setError(validationError)
            return
        }

        try {
            setError(null)
            if (isCreating) {
                const created = await createMutation.mutateAsync(formData)
                setSelectedType(created)
            } else if (isEditing && selectedType) {
                await updateMutation.mutateAsync({ id: selectedType.id, data: formData })
            }
            resetForm()
        } catch (err: unknown) {
            const errorObj = err as { response?: { data?: Record<string, unknown> } }
            if (errorObj.response?.data) {
                const data = errorObj.response.data
                if (typeof data === 'object') {
                    const messages = Object.entries(data).map(([key, val]) => {
                        if (Array.isArray(val)) return val.join(', ')
                        return `${key}: ${val}`
                    }).join('; ')
                    setError(messages)
                } else {
                    setError(t('assetTypes.saveFailed'))
                }
            } else {
                setError(t('assetTypes.saveFailed'))
            }
        }
    }

    const handleDelete = async () => {
        if (!selectedType || !canManageTypes) return
        if (!confirm(t('assetTypes.deleteConfirm'))) return

        try {
            await deleteMutation.mutateAsync(selectedType.id)
            setSelectedType(null)
        } catch (err) {
            console.error('Failed to delete:', err)
        }
    }

    const addField = () => {
        const newField: SchemaField = {
            key: `field_${Date.now()}`,
            label: '',
            type: 'text',
            required: false
        }
        setFormData({ ...formData, schema: [...formData.schema, newField] })
    }

    const updateField = (index: number, updates: Partial<SchemaField>) => {
        const newSchema = [...formData.schema]
        newSchema[index] = { ...newSchema[index], ...updates }
        setFormData({ ...formData, schema: newSchema })
    }

    const removeField = (index: number) => {
        const newSchema = formData.schema.filter((_: SchemaField, i: number) => i !== index)
        setFormData({ ...formData, schema: newSchema })
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
        )
    }

    const showEditor = isCreating || isEditing

    return (
        <div className="w-full min-w-0">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <Layers size={24} className="text-violet-500" />
                    {t('assetTypes.title')}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                    {t('assetTypes.subtitle')}
                    {canManageTypes && t('assetTypes.subtitleManage')}
                </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Types List */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="font-bold text-slate-900 dark:text-white text-sm">
                            {t('assetTypes.types', { count: assetTypes?.length || 0 })}
                        </h2>
                        {canManageTypes && (
                            <button
                                onClick={startCreate}
                                className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                title={t('assetTypes.createNewType')}
                            >
                                <Plus size={16} />
                            </button>
                        )}
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                        {assetTypes?.map((type) => (
                            <div
                                key={type.id}
                                className={`p-3 cursor-pointer transition-colors ${selectedType?.id === type.id
                                    ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                    }`}
                                onClick={() => { setSelectedType(type); resetForm(); }}
                            >
                                <div className="flex items-center gap-2">
                                    <Package size={18} className="text-purple-500" />
                                    <div>
                                        <p className="font-medium text-slate-900 dark:text-white text-sm">{type.name}</p>
                                        <p className="text-xs text-slate-500">{t('assetTypes.fieldsCount', { count: type.schema?.length || 0 })}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!assetTypes || assetTypes.length === 0) && (
                            <div className="p-6 text-center text-slate-500 text-sm">
                                <Layers size={32} className="mx-auto mb-2 opacity-30" />
                                {t('assetTypes.noTypesYet')}
                            </div>
                        )}
                    </div>
                </div>

                {/* Type Details / Editor */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    {(selectedType || isCreating) ? (
                        <>
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <h2 className="font-bold text-slate-900 dark:text-white">
                                    {isCreating ? `✨ ${t('assetTypes.createType')}` : selectedType?.name}
                                </h2>
                                <div className="flex gap-2">
                                    {showEditor ? (
                                        <>
                                            <button
                                                onClick={handleSave}
                                                className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-medium"
                                            >
                                                <Save size={16} /> {t('common.save')}
                                            </button>
                                            <button
                                                onClick={resetForm}
                                                className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm"
                                            >
                                                <X size={16} /> {t('common.cancel')}
                                            </button>
                                        </>
                                    ) : canManageTypes && (
                                        <>
                                            <button onClick={startEdit} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title={t('common.edit')}>
                                                <Pencil size={18} />
                                            </button>
                                            <button onClick={handleDelete} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title={t('common.delete')}>
                                                <Trash2 size={18} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="p-4">
                                {error && (
                                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
                                        <span className="text-lg">⚠️</span>
                                        <span>{error}</span>
                                    </div>
                                )}

                                {showEditor ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
                                                    {t('assetTypes.typeName')} <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    value={formData.name}
                                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                    placeholder={t('assetTypes.typeNamePlaceholder')}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">
                                                    {t('assetTypes.descriptionLabel')}
                                                </label>
                                                <input
                                                    value={formData.description}
                                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                    placeholder={t('assetTypes.descriptionPlaceholder')}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                        {t('assetTypes.customFields')}
                                                    </label>
                                                    <p className="text-xs text-slate-400 mt-0.5">{t('assetTypes.customFieldsDesc')}</p>
                                                </div>
                                                <button
                                                    onClick={addField}
                                                    className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-lg flex items-center gap-1.5 text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                                                >
                                                    <Plus size={14} /> {t('assetTypes.addField')}
                                                </button>
                                            </div>

                                            <div className="space-y-3">
                                                {formData.schema.map((field, index) => (
                                                    <FieldEditor
                                                        key={index}
                                                        field={field}
                                                        index={index}
                                                        onUpdate={updateField}
                                                        onRemove={removeField}
                                                    />
                                                ))}

                                                {formData.schema.length === 0 && (
                                                    <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                                                        <Type size={32} className="mx-auto mb-2 text-slate-300" />
                                                        <p className="text-slate-400 text-sm">
                                                            {t('assetTypes.noFieldsYet')}
                                                        </p>
                                                        <button
                                                            onClick={addField}
                                                            className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
                                                        >
                                                            {t('assetTypes.addFirstField')}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {selectedType?.description && (
                                            <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                                                {selectedType.description}
                                            </p>
                                        )}

                                        <div>
                                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wider">
                                                {t('assetTypes.definedFields', { count: selectedType?.schema?.length || 0 })}
                                            </h3>
                                            <div className="space-y-2">
                                                {(selectedType?.schema || []).map((field, index) => {
                                                    const FieldIcon = FIELD_TYPE_ICONS[field.type as keyof typeof FIELD_TYPE_ICONS] || Type
                                                    return (
                                                        <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                                            <FieldIcon size={18} className="text-purple-500" />
                                                            <span className="font-medium text-slate-900 dark:text-white">{field.label}</span>
                                                            <span className="text-xs text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                                                                {t(`assetTypes.fieldTypes.${field.type}`, field.type)}
                                                            </span>
                                                            {field.required && (
                                                                <span className="text-xs text-red-500 font-medium">{t('common.required')}</span>
                                                            )}
                                                            {field.type === 'select' && field.options && (
                                                                <span className="text-xs text-slate-400">
                                                                    ({t('assetTypes.optionsCount', { count: field.options.length })})
                                                                </span>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                                {(!selectedType?.schema || selectedType.schema.length === 0) && (
                                                    <p className="text-slate-400 text-sm text-center py-4">{t('assetTypes.noFieldsDefined')}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400">
                            <div className="text-center">
                                <Layers size={48} className="mx-auto mb-3 opacity-30" />
                                <p className="font-medium">{t('assetTypes.selectType')}</p>
                                {canManageTypes && <p className="text-sm mt-1">{t('assetTypes.orCreateNew')}</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
