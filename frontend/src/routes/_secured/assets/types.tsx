import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
    Layers, Plus, Pencil, Trash2, Package, KeyRound, Eye,
} from 'lucide-react'
import {
    useAssetTypes,
    useCreateAssetType,
    useUpdateAssetType,
    useDeleteAssetType,
} from '@/modules/assets'
import type { AssetType, AssetTypeCreateInput } from '@/modules/assets'
import { useAuth } from '@/auth/context'
import {
    PageHeader,
    Button,
    Badge,
    DataTable,
    EmptyState,
    ConfirmationModal,
    Modal,
    type ColumnDef,
} from '@/components/ui'
import { AssetTypeFormModal } from '@/components/assets/AssetTypeFormModal'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_secured/assets/types')({
    component: AssetTypesPage,
})

function AssetTypesPage() {
    const { user } = useAuth()
    const { t } = useTranslation()
    const { data: assetTypes = [], isLoading } = useAssetTypes()
    const createMutation = useCreateAssetType()
    const updateMutation = useUpdateAssetType()
    const deleteMutation = useDeleteAssetType()

    const canManage = !!user?.is_superuser

    const [formOpen, setFormOpen] = useState(false)
    const [editingType, setEditingType] = useState<AssetType | null>(null)
    const [viewingType, setViewingType] = useState<AssetType | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AssetType | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)

    const openCreate = () => {
        setEditingType(null)
        setSaveError(null)
        setFormOpen(true)
    }

    const openEdit = (at: AssetType) => {
        setEditingType(at)
        setSaveError(null)
        setFormOpen(true)
    }

    const handleSave = async (payload: AssetTypeCreateInput) => {
        try {
            setSaveError(null)
            if (editingType) {
                await updateMutation.mutateAsync({ id: editingType.id, data: payload })
            } else {
                await createMutation.mutateAsync(payload)
            }
            setFormOpen(false)
        } catch (err: unknown) {
            const errObj = err as { response?: { data?: Record<string, unknown> } }
            const data = errObj.response?.data
            if (data && typeof data === 'object') {
                const messages = Object.entries(data).map(([k, v]) => {
                    if (Array.isArray(v)) return v.join(', ')
                    return `${k}: ${v}`
                }).join('; ')
                setSaveError(messages || t('assetTypes.saveFailed'))
            } else {
                setSaveError(t('assetTypes.saveFailed'))
            }
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        await deleteMutation.mutateAsync(deleteTarget.id)
        setDeleteTarget(null)
    }

    const columns: ColumnDef<AssetType>[] = [
        {
            key: 'name',
            header: t('assetTypes.list.name'),
            sortable: true,
            sortAccessor: (r) => r.name,
            cell: (r) => (
                <div className="flex items-center gap-2">
                    <Package size={16} className="text-blue-500 shrink-0" />
                    <span className="font-medium text-slate-900 dark:text-white">{r.name}</span>
                </div>
            ),
        },
        {
            key: 'description',
            header: t('assetTypes.list.description'),
            cell: (r) => (
                <span className="text-slate-500 dark:text-slate-400 line-clamp-1 max-w-md">
                    {r.description || '—'}
                </span>
            ),
        },
        {
            key: 'fields',
            header: t('assetTypes.list.fieldsCol'),
            sortable: true,
            sortAccessor: (r) => r.schema?.length || 0,
            cell: (r) => (
                <Badge variant="info">{t('assetTypes.fieldsCount', { count: r.schema?.length || 0 })}</Badge>
            ),
        },
        {
            key: 'uniqueKey',
            header: t('assetTypes.list.uniqueKey'),
            cell: (r) => {
                const unique = r.schema?.find((f) => f.is_unique_key)
                return unique ? (
                    <Badge variant="warning" icon={<KeyRound size={10} />}>{unique.label}</Badge>
                ) : (
                    <span className="text-slate-300">—</span>
                )
            },
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (r) => (
                <div className="flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setViewingType(r) }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        title={t('assetTypes.list.view')}
                    >
                        <Eye size={15} />
                    </button>
                    {canManage && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEdit(r) }}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                title={t('common.edit')}
                            >
                                <Pencil size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(r) }}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                title={t('common.delete')}
                            >
                                <Trash2 size={15} />
                            </button>
                        </>
                    )}
                </div>
            ),
        },
    ]

    return (
        <div className="w-full min-w-0">
            <PageHeader
                icon={<Layers size={22} />}
                title={t('assetTypes.title')}
                subtitle={t('assetTypes.subtitle') + (canManage ? t('assetTypes.subtitleManage') : '')}
                actions={
                    canManage && (
                        <Button icon={<Plus size={16} />} onClick={openCreate}>
                            {t('assetTypes.addNew')}
                        </Button>
                    )
                }
            />

            <DataTable
                data={assetTypes}
                columns={columns}
                isLoading={isLoading}
                pageSize={25}
                getRowId={(r) => r.id}
                onRowClick={(r) => setViewingType(r)}
                emptyState={
                    <EmptyState
                        icon={<Layers size={40} />}
                        title={t('assetTypes.noTypesYet')}
                        description={canManage ? t('assetTypes.orCreateNew') : undefined}
                        action={
                            canManage ? (
                                <Button icon={<Plus size={14} />} size="sm" onClick={openCreate}>
                                    {t('assetTypes.addNew')}
                                </Button>
                            ) : undefined
                        }
                    />
                }
            />

            <AssetTypeFormModal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                assetType={editingType}
                onSave={handleSave}
                isLoading={createMutation.isPending || updateMutation.isPending}
                error={saveError}
            />

            <AssetTypeDetailModal
                assetType={viewingType}
                isOpen={!!viewingType}
                onClose={() => setViewingType(null)}
                onEdit={canManage ? (at) => { setViewingType(null); openEdit(at) } : undefined}
            />

            <ConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title={t('common.delete')}
                message={t('assetTypes.deleteConfirm')}
                confirmText={t('common.delete')}
                type="danger"
                isLoading={deleteMutation.isPending}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail modal
// ─────────────────────────────────────────────────────────────────────────────

function AssetTypeDetailModal({
    assetType,
    isOpen,
    onClose,
    onEdit,
}: {
    assetType: AssetType | null
    isOpen: boolean
    onClose: () => void
    onEdit?: (at: AssetType) => void
}) {
    const { t } = useTranslation()
    if (!assetType) return null

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={assetType.name} size="lg">
            <div className="space-y-5">
                {assetType.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                        {assetType.description}
                    </p>
                )}

                <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        {t('assetTypes.definedFields', { count: assetType.schema?.length || 0 })}
                    </h3>
                    {(assetType.schema?.length || 0) === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">{t('assetTypes.noFieldsDefined')}</p>
                    ) : (
                        <div className="space-y-2">
                            {assetType.schema?.map((field, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                                >
                                    <span className="font-medium text-slate-900 dark:text-white truncate">
                                        {field.label}
                                    </span>
                                    <Badge variant="neutral" size="sm">
                                        {t(`assetTypes.fieldTypes.${field.type}`)}
                                    </Badge>
                                    {field.required && (
                                        <span className="text-xs text-red-500 font-medium">{t('common.required')}</span>
                                    )}
                                    {field.is_unique_key && (
                                        <Badge variant="warning" size="sm" icon={<KeyRound size={10} />}>
                                            {t('assetTypes.uniqueIndexField')}
                                        </Badge>
                                    )}
                                    {field.type === 'select' && field.options && (
                                        <span className="text-xs text-slate-400">
                                            {t('assetTypes.optionsCount', { count: field.options.length })}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {onEdit && (
                    <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                        <Button icon={<Pencil size={14} />} variant="secondary" onClick={() => onEdit(assetType)}>
                            {t('common.edit')}
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    )
}
