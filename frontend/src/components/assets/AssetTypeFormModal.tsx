import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ChevronDown,
    ChevronUp,
    GripVertical,
    Type,
    Hash,
    Calendar,
    List,
    CheckSquare,
    Mail,
    Phone,
    Plus,
    Trash2,
    KeyRound,
    X,
} from 'lucide-react'
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    useSortable,
    arrayMove,
    verticalListSortingStrategy,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { CatalogMetadataFields } from './CatalogMetadataFields'
import type { CatalogMetadata, AssetType, AssetTypeCreateInput, SchemaField } from '@/modules/assets'
import {
    Modal,
    FormField,
    FormSection,
    FormFooter,
    Badge,
    Button,
    EmptyState,
    formControlClass,
    cn,
} from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────

type FieldType = SchemaField['type']

type EditableField = SchemaField & { _uid: string }

const FIELD_TYPES: Array<{ id: FieldType; icon: React.ReactNode }> = [
    { id: 'text', icon: <Type size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
    { id: 'number', icon: <Hash size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
    { id: 'date', icon: <Calendar size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
    { id: 'select', icon: <List size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
    { id: 'checkbox', icon: <CheckSquare size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
    { id: 'email', icon: <Mail size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
    { id: 'phone', icon: <Phone size={16} className="shrink-0 text-slate-500 dark:text-slate-400" /> },
]

const iconForType = (type: FieldType) => FIELD_TYPES.find((item) => item.id === type)?.icon

const makeUid = () => globalThis.crypto?.randomUUID?.() ?? `f_${Date.now()}_${Math.random().toString(36).slice(2)}`

const slugify = (label: string) =>
    label
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
        .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

export interface AssetTypeFormModalProps {
    isOpen: boolean
    onClose: () => void
    /** When provided, renders edit mode against this type. */
    assetType?: AssetType | null
    onSave: (data: AssetTypeCreateInput) => Promise<void> | void
    isLoading: boolean
    error?: string | null
}

interface EditableForm extends CatalogMetadata {
    tracking_mode: 'individual' | 'stock'
    name: string
    description: string
    schema: EditableField[]
}

function initialForm(assetType?: AssetType | null): EditableForm {
    if (!assetType) return { name: '', description: '', schema: [], tracking_mode: 'individual' }
    return {
        tracking_mode: assetType.tracking_mode ?? 'individual',
        name: assetType.name,
        description: assetType.description || '',
        catalog_code: assetType.catalog_code,
        category_code: assetType.category_code,
        sharing_class: assetType.sharing_class,
        exclusion_reason: assetType.exclusion_reason,
        schema: (assetType.schema || []).map((field) => ({ ...field, _uid: makeUid() })),
    }
}

export function AssetTypeFormModal(props: AssetTypeFormModalProps) {
    if (!props.isOpen) return null
    return <AssetTypeFormModalContent key={props.assetType?.id ?? 'new'} {...props} />
}

function AssetTypeFormModalContent({
    isOpen,
    onClose,
    assetType,
    onSave,
    isLoading,
    error,
}: AssetTypeFormModalProps) {
    const { t } = useTranslation()
    const [formData, setFormData] = useState<EditableForm>(() => initialForm(assetType))
    const [expandedUid, setExpandedUid] = useState<string | null>(null)
    const [localError, setLocalError] = useState<string | null>(null)

    const toPayload = (form: EditableForm): AssetTypeCreateInput => ({
        tracking_mode: form.tracking_mode,
        catalog_code: form.catalog_code || null,
        category_code: form.category_code || '',
        sharing_class: form.sharing_class || '',
        exclusion_reason: form.exclusion_reason || '',
        name: form.name,
        description: form.description,
        schema: form.schema.map((field) => {
            const result = { ...field }
            delete (result as Partial<EditableField>)._uid
            return result
        }),
    })

    const validate = (): string | null => {
        if (!formData.name.trim()) return t('assetTypes.nameRequired')
        for (const f of formData.schema) {
            if (!f.label.trim()) return t('assetTypes.allFieldsRequired')
            if (f.type === 'select' && (!f.options || f.options.length === 0)) {
                return t('assetTypes.selectOptionsRequired', { field: f.label })
            }
        }
        return null
    }

    const handleSave = async () => {
        if (isLoading) return
        const err = validate()
        if (err) { setLocalError(err); return }
        setLocalError(null)
        await onSave(toPayload(formData))
    }

    const addField = (type: FieldType) => {
        if (isLoading) return
        const newField: EditableField = {
            _uid: makeUid(),
            key: `field_${Date.now()}`,
            label: '',
            type,
            required: false,
            options: type === 'select' ? [] : undefined,
        }
        setFormData((prev) => ({ ...prev, schema: [...prev.schema, newField] }))
        setExpandedUid(newField._uid)
    }

    const changeTrackingMode = (trackingMode: 'individual' | 'stock') => {
        if (isLoading || assetType) return
        setFormData(previous => {
            if (trackingMode === 'individual') return { ...previous, tracking_mode: trackingMode }
            const stockFields: SchemaField[] = [
                { key: 'material_code', label: t('inventory.materialCode'), type: 'text', required: true, is_unique_key: true },
                { key: 'material_name', label: t('inventory.materialName'), type: 'text', required: true },
                { key: 'quantity', label: t('inventory.totalStock'), type: 'number', required: true },
            ]
            const schema = previous.schema.map(field => {
                const stockField = stockFields.find(item => item.key === field.key)
                return stockField ? { ...field, ...stockField, label: field.label || stockField.label }
                    : { ...field, is_unique_key: false }
            })
            stockFields.forEach(field => {
                if (!schema.some(item => item.key === field.key)) schema.push({ ...field, _uid: makeUid() })
            })
            return { ...previous, tracking_mode: trackingMode, schema }
        })
    }

    const updateField = useCallback((uid: string, updates: Partial<SchemaField>) => {
        if (isLoading) return
        setFormData((prev) => ({
            ...prev,
            schema: prev.schema.map((f) => (f._uid === uid ? { ...f, ...updates } : f)),
        }))
    }, [isLoading])

    const removeField = (uid: string) => {
        if (isLoading) return
        setFormData((prev) => ({ ...prev, schema: prev.schema.filter((f) => f._uid !== uid) }))
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const handleDragEnd = (e: DragEndEvent) => {
        if (isLoading) return
        const { active, over } = e
        if (!over || active.id === over.id) return
        setFormData((prev) => {
            const oldIndex = prev.schema.findIndex((f) => f._uid === active.id)
            const newIndex = prev.schema.findIndex((f) => f._uid === over.id)
            if (oldIndex === -1 || newIndex === -1) return prev
            return { ...prev, schema: arrayMove(prev.schema, oldIndex, newIndex) }
        })
    }

    const uniqueKeyUid = useMemo(
        () => formData.schema.find((f) => f.is_unique_key)?._uid,
        [formData.schema],
    )

    const displayError = error ?? localError

    return (
        <Modal
            isOpen={isOpen}
            closeDisabled={isLoading}
            onClose={onClose}
            size="xl"
            title={assetType ? t('assetTypes.editType') : t('assetTypes.createType')}
            footer={
                <FormFooter
                    loading={isLoading}
                    onPrimary={handleSave}
                    onCancel={onClose}
                    primaryLabel={assetType ? t('common.save') : t('common.create')}
                    icon={null}
                    leading={
                        <span className="text-xs">
                            {t('assetTypes.builder.fieldsCount', { count: formData.schema.length })}
                        </span>
                    }
                />
            }
        >
            <fieldset disabled={isLoading} className="min-w-0 space-y-6">
                {displayError && (
                    <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                        {displayError}
                    </div>
                )}

                <FormSection title={t('assetTypes.builder.basicInfo')} layout="grid">
                    <FormField label={t('assetTypes.typeName')} required>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className={formControlClass}
                            placeholder={t('assetTypes.typeNamePlaceholder')}
                            autoFocus={!assetType}
                        />
                    </FormField>
                    <FormField label={t('assetTypes.descriptionLabel')}>
                        <input
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className={formControlClass}
                            placeholder={t('assetTypes.descriptionPlaceholder')}
                        />
                    </FormField>
                </FormSection>

                <fieldset className="min-w-0">
                    <legend className="text-sm font-semibold text-slate-900 dark:text-white">{t('assetTypes.trackingTitle')}</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(['individual', 'stock'] as const).map(mode => <label key={mode} className={cn('flex items-start gap-3 rounded-md border p-4', assetType ? 'cursor-default' : 'cursor-pointer', formData.tracking_mode === mode ? 'border-blue-600 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700')}>
                            <input type="radio" name="tracking-mode" value={mode} checked={formData.tracking_mode === mode} disabled={!!assetType} onChange={() => changeTrackingMode(mode)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                            <span className="min-w-0"><span className="block text-sm font-medium text-slate-900 dark:text-white">{t(`assetTypes.tracking.${mode}`)}</span><span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">{t(`assetTypes.trackingHelp.${mode}`)}</span></span>
                        </label>)}
                    </div>
                    {formData.tracking_mode === 'stock' && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('assetTypes.stockFieldsHelp')}</p>}
                    {assetType && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('assetTypes.trackingChangeHelp')}</p>}
                </fieldset>

                <CatalogMetadataFields value={formData} onChange={updates => setFormData(previous => ({ ...previous, ...updates }))} />

                <FormSection
                    title={t('assetTypes.builder.fields')}
                    description={t('assetTypes.builder.fieldsHelp')}
                    actions={<AddFieldPicker onPick={addField} />}
                >
                    {formData.schema.length === 0 ? (
                        <EmptyState
                            icon={<Type size={32} />}
                            title={t('assetTypes.builder.emptyTitle')}
                            description={t('assetTypes.builder.emptyDescription')}
                            compact
                        />
                    ) : (
                        <div className="space-y-2">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext
                                    items={formData.schema.map((f) => f._uid)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {formData.schema.map((field) => (
                                        <FieldRow
                                            key={field._uid}
                                            field={field}
                                            isExpanded={expandedUid === field._uid}
                                            onToggle={() =>
                                                setExpandedUid((prev) => (prev === field._uid ? null : field._uid))
                                            }
                                            onUpdate={(updates) => updateField(field._uid, updates)}
                                            onRemove={() => removeField(field._uid)}
                                            hasOtherUniqueKey={!!uniqueKeyUid && uniqueKeyUid !== field._uid}
                                            stockField={formData.tracking_mode === 'stock' && ['material_code', 'material_name', 'quantity'].includes(field.key)}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                                <GripVertical size={12} />
                                {t('assetTypes.builder.reorderHint')}
                            </p>
                        </div>
                    )}
                </FormSection>
            </fieldset>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Type picker popover
// ─────────────────────────────────────────────────────────────────────────────

function AddFieldPicker({ onPick }: { onPick: (t: FieldType) => void }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const btnRef = useRef<HTMLButtonElement>(null)
    const popRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (!popRef.current || !btnRef.current) return
            if (!popRef.current.contains(e.target as Node) && !btnRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    return (
        <div className="relative">
            <Button
                ref={btnRef}
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                onClick={() => setOpen((v) => !v)}
            >
                {t('assetTypes.builder.addFieldBtn')}
            </Button>
            {open && (
                <div
                    ref={popRef}
                    className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-md border border-slate-300 bg-white p-2 shadow-sm dark:border-slate-600 dark:bg-slate-900"
                >
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 px-2 pb-1">
                        {t('assetTypes.builder.pickType')}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                        {FIELD_TYPES.map(({ id, icon }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => {
                                    onPick(id)
                                    setOpen(false)
                                }}
                                className="flex items-center gap-2 px-2.5 py-2 rounded-md text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                {icon}
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {t(`assetTypes.fieldTypes.${id}`)}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                        {t(`assetTypes.fieldTypeDescriptions.${id}`, '')}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortable field row (collapsed + expanded)
// ─────────────────────────────────────────────────────────────────────────────

function FieldRow({
    field,
    isExpanded,
    onToggle,
    onUpdate,
    onRemove,
    hasOtherUniqueKey,
    stockField = false,
}: {
    field: EditableField
    isExpanded: boolean
    onToggle: () => void
    onUpdate: (updates: Partial<SchemaField>) => void
    onRemove: () => void
    hasOtherUniqueKey: boolean
    stockField?: boolean
}) {
    const { t } = useTranslation()
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: field._uid,
    })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.6 : 1,
    }

    const handleLabelChange = (label: string) => {
        const key = stockField ? field.key : slugify(label) || `field_${field._uid.slice(0, 6)}`
        onUpdate({ label, key })
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                isDragging && 'shadow-sm',
            )}
        >
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing"
                    title={t('assetTypes.builder.reorderHint')}
                >
                    <GripVertical size={14} />
                </button>
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                    {iconForType(field.type)}
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">
                        {field.label || t('assetTypes.newField')}
                    </span>
                    <Badge variant="neutral" size="sm">
                        {t(`assetTypes.fieldTypes.${field.type}`)}
                    </Badge>
                    {field.required && <span className="text-red-500 text-xs">*</span>}
                    {field.is_unique_key && (
                        <Badge variant="warning" size="sm" icon={<KeyRound size={10} />}>
                            {t('assetTypes.uniqueIndexField')}
                        </Badge>
                    )}
                </button>
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={stockField}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    title={t('common.delete')}
                >
                    <Trash2 size={14} />
                </button>
                <button
                    type="button"
                    onClick={onToggle}
                    className="p-1 text-slate-400"
                    aria-label="Toggle"
                >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-slate-100 dark:border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                            label={t('assetTypes.fieldName')}
                            required
                            help={field.key ? t('assetTypes.keyLabel', { key: field.key }) : undefined}
                        >
                            <input
                                value={field.label}
                                onChange={(e) => handleLabelChange(e.target.value)}
                                className={formControlClass}
                                placeholder={t('assetTypes.fieldNamePlaceholder')}
                            />
                        </FormField>
                        <FormField label={t('assetTypes.fieldTypeLabel')}>
                            <select
                                value={field.type}
                                disabled={stockField}
                                onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
                                className={formControlClass}
                            >
                                {FIELD_TYPES.map(({ id }) => (
                                    <option key={id} value={id}>
                                        {t(`assetTypes.fieldTypes.${id}`)}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                    </div>

                    {field.type === 'select' && (
                        <FormField label={t('assetTypes.options')} required>
                            <OptionsEditor
                                options={field.options || []}
                                onChange={(options) => onUpdate({ options })}
                            />
                        </FormField>
                    )}

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <Toggle
                                checked={field.required || false}
                                disabled={stockField}
                                onChange={(v) => onUpdate({ required: v })}
                            />
                            <span className="text-sm text-slate-600 dark:text-slate-300">
                                {t('assetTypes.requiredField')}
                            </span>
                        </label>
                        <div>
                            <label
                                className={cn(
                                    'flex items-center gap-2',
                                    hasOtherUniqueKey && !field.is_unique_key
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'cursor-pointer',
                                )}
                            >
                                <Toggle
                                    checked={field.is_unique_key || false}
                                    disabled={stockField || (hasOtherUniqueKey && !field.is_unique_key)}
                                    onChange={(v) => onUpdate({ is_unique_key: v })}
                                    tone="amber"
                                />
                                <span className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                                    <KeyRound size={13} className="text-amber-500" />
                                    {t('assetTypes.uniqueIndexField')}
                                </span>
                            </label>
                            {hasOtherUniqueKey && !field.is_unique_key && (
                                <p className="text-xs text-slate-400 mt-1">{t('assetTypes.uniqueIndexDisabled')}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small controls
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
    checked,
    onChange,
    disabled,
    tone = 'blue',
}: {
    checked: boolean
    onChange: (v: boolean) => void
    disabled?: boolean
    tone?: 'blue' | 'amber'
}) {
    const base =
        'w-9 h-5 rounded-full bg-slate-200 dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[""] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all'
    const toneClass = tone === 'amber' ? 'peer-checked:bg-amber-500' : 'peer-checked:bg-blue-600'
    return (
        <span className="relative inline-flex items-center">
            <input
                type="checkbox"
                className="sr-only peer"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span className={cn(base, toneClass, disabled && 'opacity-50')} />
        </span>
    )
}

function OptionsEditor({
    options,
    onChange,
}: {
    options: string[]
    onChange: (next: string[]) => void
}) {
    const { t } = useTranslation()
    const [draft, setDraft] = useState('')

    const add = () => {
        const v = draft.trim()
        if (!v) return
        if (options.includes(v)) { setDraft(''); return }
        onChange([...options, v])
        setDraft('')
    }
    const remove = (v: string) => onChange(options.filter((o) => o !== v))

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            add()
                        }
                    }}
                    placeholder={t('assetTypes.builder.addOptionPlaceholder')}
                    className={formControlClass}
                />
                <Button type="button" variant="secondary" size="md" onClick={add}>
                    {t('assetTypes.builder.addOption')}
                </Button>
            </div>
            {options.length === 0 ? (
                <p className="text-xs text-slate-400">{t('assetTypes.builder.noOptions')}</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {options.map((opt) => (
                        <span
                            key={opt}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-700 dark:text-slate-200"
                        >
                            {opt}
                            <button
                                type="button"
                                onClick={() => remove(opt)}
                                className="text-slate-400 hover:text-red-500"
                                aria-label="Remove"
                            >
                                <X size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
