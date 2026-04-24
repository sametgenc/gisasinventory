import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Megaphone, Sparkles, Bug, Wrench, Info, Paperclip, Download, FileText } from 'lucide-react'

import { usePublicPlatformReleases } from '@/modules/platform_releases'
import type { PlatformReleaseType } from '@/modules/platform_releases'
import { PageHeader, Badge, Card, EmptyState } from '@/components/ui'

export const Route = createFileRoute('/_secured/whats-new')({
    component: WhatsNewPage,
})

const typeMeta: Record<PlatformReleaseType, {
    icon: React.ComponentType<{ size?: number; className?: string }>
    badgeVariant: 'info' | 'warning' | 'success' | 'danger' | 'neutral'
    i18nKey: string
    color: string
}> = {
    feature: { icon: Sparkles, badgeVariant: 'info', i18nKey: 'releases.type.feature', color: 'text-blue-500' },
    bugfix: { icon: Bug, badgeVariant: 'danger', i18nKey: 'releases.type.bugfix', color: 'text-red-500' },
    improvement: { icon: Wrench, badgeVariant: 'success', i18nKey: 'releases.type.improvement', color: 'text-emerald-500' },
    announcement: { icon: Info, badgeVariant: 'neutral', i18nKey: 'releases.type.announcement', color: 'text-slate-500' },
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

function isImage(contentType: string, name: string): boolean {
    if (contentType?.startsWith('image/')) return true
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
}

function WhatsNewPage() {
    const { t } = useTranslation()
    const { data: releases, isLoading } = usePublicPlatformReleases()

    return (
        <div className="w-full min-w-0 max-w-4xl mx-auto">
            <PageHeader
                icon={<Megaphone size={22} />}
                title={t('releases.publicTitle')}
                subtitle={t('releases.publicSubtitle')}
            />

            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} padded>
                            <div className="animate-pulse space-y-3">
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                            </div>
                        </Card>
                    ))}
                </div>
            ) : !releases || releases.length === 0 ? (
                <Card padded>
                    <EmptyState
                        icon={<Megaphone size={40} />}
                        title={t('releases.noPublicReleases')}
                    />
                </Card>
            ) : (
                <div className="space-y-4">
                    {releases.map((r) => {
                        const meta = typeMeta[r.type]
                        const Icon = meta.icon
                        const date = r.published_at ? new Date(r.published_at) : new Date(r.created_at)
                        return (
                            <Card key={r.id} padded>
                                <div className="flex items-start gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 ${meta.color}`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-2 mb-1">
                                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                {r.version}
                                            </span>
                                            <Badge variant={meta.badgeVariant}>{t(meta.i18nKey)}</Badge>
                                            <span className="text-xs text-slate-400">
                                                {date.toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-slate-900 dark:text-white">{r.title}</h3>
                                    </div>
                                </div>

                                {r.body && (
                                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap pl-13">
                                        {r.body}
                                    </div>
                                )}

                                {r.attachments.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
                                            <Paperclip size={12} />
                                            {t('releases.attachments')} ({r.attachments.length})
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {r.attachments.map((a) => (
                                                a.url && isImage(a.content_type, a.original_name) ? (
                                                    <a
                                                        key={a.id}
                                                        href={a.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition-colors"
                                                    >
                                                        <img src={a.url} alt={a.original_name} className="w-full h-32 object-cover" />
                                                        <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 truncate">
                                                            {a.original_name}
                                                        </div>
                                                    </a>
                                                ) : (
                                                    <a
                                                        key={a.id}
                                                        href={a.url ?? '#'}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                                                    >
                                                        <FileText size={16} className="text-slate-400 shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{a.original_name}</p>
                                                            <p className="text-xs text-slate-400">{formatBytes(a.size)}</p>
                                                        </div>
                                                        <Download size={14} className="text-slate-400 shrink-0" />
                                                    </a>
                                                )
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
