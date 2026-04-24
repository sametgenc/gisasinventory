import { useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
    Megaphone, Plus, Pencil, Trash2, Paperclip, Send,
    Eye, EyeOff, Upload, FileText, Bug, Sparkles, Wrench, Info,
    Download, X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
    usePlatformReleases,
    useCreatePlatformRelease,
    useUpdatePlatformRelease,
    useDeletePlatformRelease,
    usePublishPlatformRelease,
    useUnpublishPlatformRelease,
    useUploadPlatformReleaseAttachments,
    useDeletePlatformReleaseAttachment,
} from '@/modules/platform_releases'
import type {
    PlatformRelease,
    PlatformReleaseType,
    PlatformReleaseStatus,
    PlatformReleaseInput,
} from '@/modules/platform_releases'

import {
    PageHeader, Button, Badge, DataTable, EmptyState, Modal,
    ConfirmationModal, FormField,
    type ColumnDef,
} from '@/components/ui'
import { formControlClass } from '@/components/ui/FormField'

export const Route = createFileRoute('/_secured/platform/releases')({
    component: PlatformReleasesPage,
})

const typeMeta: Record<PlatformReleaseType, {
    icon: React.ComponentType<{ size?: number; className?: string }>
    badgeVariant: 'info' | 'warning' | 'success' | 'danger' | 'neutral'
    i18nKey: string
}> = {
    feature: { icon: Sparkles, badgeVariant: 'info', i18nKey: 'releases.type.feature' },
    bugfix: { icon: Bug, badgeVariant: 'danger', i18nKey: 'releases.type.bugfix' },
    improvement: { icon: Wrench, badgeVariant: 'success', i18nKey: 'releases.type.improvement' },
    announcement: { icon: Info, badgeVariant: 'neutral', i18nKey: 'releases.type.announcement' },
}

function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

function PlatformReleasesPage() {
    const { t } = useTranslation()
    const { data: releases, isLoading } = usePlatformReleases()

    const createMutation = useCreatePlatformRelease()
    const updateMutation = useUpdatePlatformRelease()
    const deleteMutation = useDeletePlatformRelease()
    const publishMutation = usePublishPlatformRelease()
    const unpublishMutation = useUnpublishPlatformRelease()
    const uploadMutation = useUploadPlatformReleaseAttachments()
    const deleteAttachmentMutation = useDeletePlatformReleaseAttachment()

    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editing, setEditing] = useState<PlatformRelease | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<PlatformRelease | null>(null)

    const sorted = useMemo(
        () => (releases ?? []).slice().sort((a, b) => {
            const aTs = a.published_at ?? a.created_at
            const bTs = b.published_at ?? b.created_at
            return bTs.localeCompare(aTs)
        }),
        [releases],
    )

    const handleCreate = () => { setEditing(null); setIsFormOpen(true) }
    const handleEdit = (r: PlatformRelease) => { setEditing(r); setIsFormOpen(true) }

    const handleSave = async (data: PlatformReleaseInput, files: File[]) => {
        const release = editing
            ? await updateMutation.mutateAsync({ id: editing.id, data })
            : await createMutation.mutateAsync(data)
        if (files.length > 0) {
            await uploadMutation.mutateAsync({ id: release.id, files })
        }
        setIsFormOpen(false)
        setEditing(null)
    }

    const handleTogglePublish = async (r: PlatformRelease) => {
        if (r.status === 'published') {
            await unpublishMutation.mutateAsync(r.id)
        } else {
            await publishMutation.mutateAsync(r.id)
        }
    }

    const columns: ColumnDef<PlatformRelease>[] = [
        {
            key: 'version',
            header: t('releases.tableVersion'),
            sortable: true,
            sortAccessor: (r) => r.version,
            cell: (r) => {
                const meta = typeMeta[r.type]
                const Icon = meta.icon
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                            <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{r.title}</p>
                            <p className="text-xs text-slate-500 truncate font-mono">{r.version}</p>
                        </div>
                    </div>
                )
            },
        },
        {
            key: 'type',
            header: t('releases.tableType'),
            cell: (r) => {
                const meta = typeMeta[r.type]
                return <Badge variant={meta.badgeVariant}>{t(meta.i18nKey)}</Badge>
            },
        },
        {
            key: 'status',
            header: t('common.status'),
            cell: (r) => (
                r.status === 'published'
                    ? <Badge variant="success">{t('releases.statusPublished')}</Badge>
                    : <Badge variant="neutral">{t('releases.statusDraft')}</Badge>
            ),
        },
        {
            key: 'attachments',
            header: t('releases.tableAttachments'),
            cell: (r) => (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Paperclip size={12} />
                    {r.attachments.length}
                </span>
            ),
        },
        {
            key: 'date',
            header: t('releases.tableDate'),
            sortable: true,
            sortAccessor: (r) => r.published_at ?? r.created_at,
            cell: (r) => (
                <span className="text-xs text-slate-500">
                    {new Date(r.published_at ?? r.created_at).toLocaleDateString()}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (r) => (
                <div className="flex items-center justify-end gap-1">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleTogglePublish(r) }}
                        className={`p-2 rounded-md transition-colors ${r.status === 'published'
                            ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                        title={r.status === 'published' ? t('releases.unpublish') : t('releases.publish')}
                    >
                        {r.status === 'published' ? <EyeOff size={15} /> : <Send size={15} />}
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleEdit(r) }}
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
                </div>
            ),
        },
    ]

    return (
        <div className="w-full min-w-0">
            <PageHeader
                icon={<Megaphone size={22} />}
                title={t('releases.title')}
                subtitle={t('releases.subtitle')}
                actions={
                    <Button icon={<Plus size={16} />} onClick={handleCreate}>
                        {t('releases.addNew')}
                    </Button>
                }
            />

            <DataTable
                data={sorted}
                columns={columns}
                isLoading={isLoading}
                getRowId={(r) => r.id}
                pageSize={25}
                onRowClick={(r) => handleEdit(r)}
                emptyState={
                    <EmptyState
                        icon={<Megaphone size={40} />}
                        title={t('releases.noReleasesYet')}
                        action={
                            <Button icon={<Plus size={14} />} size="sm" onClick={handleCreate}>
                                {t('releases.addFirst')}
                            </Button>
                        }
                    />
                }
            />

            <ReleaseFormModal
                isOpen={isFormOpen}
                onClose={() => { setIsFormOpen(false); setEditing(null) }}
                release={editing}
                onSave={handleSave}
                onDeleteAttachment={async (releaseId, attachmentId) => {
                    await deleteAttachmentMutation.mutateAsync({ releaseId, attachmentId })
                }}
                isSaving={createMutation.isPending || updateMutation.isPending || uploadMutation.isPending}
            />

            <ConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={async () => {
                    if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.id)
                    setDeleteTarget(null)
                }}
                title={t('common.delete')}
                message={t('releases.deleteConfirm', { title: deleteTarget?.title ?? '' })}
                confirmText={t('common.delete')}
                type="danger"
                isLoading={deleteMutation.isPending}
            />
        </div>
    )
}

interface ReleaseFormModalProps {
    isOpen: boolean
    onClose: () => void
    release: PlatformRelease | null
    onSave: (data: PlatformReleaseInput, files: File[]) => Promise<void>
    onDeleteAttachment: (releaseId: string, attachmentId: string) => Promise<void>
    isSaving: boolean
}

function ReleaseFormModal({
    isOpen, onClose, release, onSave, onDeleteAttachment, isSaving,
}: ReleaseFormModalProps) {
    const { t } = useTranslation()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [version, setVersion] = useState(release?.version ?? '')
    const [type, setType] = useState<PlatformReleaseType>(release?.type ?? 'feature')
    const [title, setTitle] = useState(release?.title ?? '')
    const [body, setBody] = useState(release?.body ?? '')
    const [status, setStatus] = useState<PlatformReleaseStatus>(release?.status ?? 'draft')
    const [pendingFiles, setPendingFiles] = useState<File[]>([])

    // Re-sync when modal opens with different release
    const lastReleaseIdRef = useRef<string | null>(null)
    if (isOpen && release?.id !== lastReleaseIdRef.current) {
        lastReleaseIdRef.current = release?.id ?? null
        setVersion(release?.version ?? '')
        setType(release?.type ?? 'feature')
        setTitle(release?.title ?? '')
        setBody(release?.body ?? '')
        setStatus(release?.status ?? 'draft')
        setPendingFiles([])
    }
    if (!isOpen && lastReleaseIdRef.current !== null) {
        lastReleaseIdRef.current = null
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length) {
            setPendingFiles((prev) => [...prev, ...files])
        }
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await onSave(
            { version: version.trim(), type, title: title.trim(), body, status },
            pendingFiles,
        )
    }

    const typeOptions: PlatformReleaseType[] = ['feature', 'bugfix', 'improvement', 'announcement']

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={release ? t('releases.editTitle') : t('releases.createTitle')}
            size="xl"
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        loading={isSaving}
                        disabled={!version.trim() || !title.trim()}
                    >
                        {release ? t('common.save') : t('common.create')}
                    </Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField label={t('releases.fieldVersion')} required>
                        <input
                            type="text"
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                            placeholder="v1.2.0"
                            className={formControlClass + ' font-mono'}
                        />
                    </FormField>
                    <FormField label={t('releases.fieldType')} required>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as PlatformReleaseType)}
                            className={formControlClass}
                        >
                            {typeOptions.map((o) => (
                                <option key={o} value={o}>{t(typeMeta[o].i18nKey)}</option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label={t('common.status')}>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as PlatformReleaseStatus)}
                            className={formControlClass}
                        >
                            <option value="draft">{t('releases.statusDraft')}</option>
                            <option value="published">{t('releases.statusPublished')}</option>
                        </select>
                    </FormField>
                </div>

                <FormField label={t('releases.fieldTitle')} required>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={formControlClass}
                    />
                </FormField>

                <FormField
                    label={t('releases.fieldBody')}
                    help={t('releases.bodyHelp')}
                >
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={8}
                        className={formControlClass + ' font-mono text-xs'}
                    />
                </FormField>

                <div>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Paperclip size={14} />
                        {t('releases.attachments')}
                    </label>

                    {release && release.attachments.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                            {release.attachments.map((a) => (
                                <div
                                    key={a.id}
                                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText size={16} className="text-slate-400 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{a.original_name}</p>
                                            <p className="text-xs text-slate-400">{formatBytes(a.size)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {a.url && (
                                            <a
                                                href={a.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md"
                                                title={t('common.download')}
                                            >
                                                <Download size={14} />
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onDeleteAttachment(release.id, a.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                                            title={t('common.delete')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {pendingFiles.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                            {pendingFiles.map((f, idx) => (
                                <div
                                    key={`${f.name}-${idx}`}
                                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText size={16} className="text-blue-500 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{f.name}</p>
                                            <p className="text-xs text-slate-500">{formatBytes(f.size)} · {t('releases.pending')}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-colors flex flex-col items-center gap-1 text-slate-500"
                    >
                        <Upload size={20} />
                        <span className="text-sm">{t('releases.clickToAttach')}</span>
                        <span className="text-xs text-slate-400">{t('releases.attachHint')}</span>
                    </button>
                </div>
            </form>
        </Modal>
    )
}
