import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Sparkles, MessageSquarePlus, Paperclip, X, CheckCircle2, Loader2 } from 'lucide-react';

import { useAuth } from '../auth/context';
import api from '../api/client';

type FeedbackType = 'bug' | 'feature';

function formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export const FeedbackBubble: React.FC = () => {
    const { user } = useAuth();
    const { t } = useTranslation();

    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<FeedbackType>('bug');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justSubmitted, setJustSubmitted] = useState(false);

    const popoverRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const onEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onEscape);
        };
    }, [isOpen]);

    const resetForm = () => {
        setType('bug');
        setSubject('');
        setDescription('');
        setFiles([]);
        setError(null);
    };

    const handleOpen = () => {
        setJustSubmitted(false);
        resetForm();
        setIsOpen(true);
    };

    const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []);
        if (picked.length) setFiles((prev) => [...prev, ...picked]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (idx: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim() || !description.trim()) {
            setError(t('feedback.validationRequired'));
            return;
        }
        setError(null);
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('type', type);
            formData.append('subject', subject.trim());
            formData.append('description', description.trim());
            formData.append('page_url', window.location.href);
            formData.append('user_agent', navigator.userAgent);
            for (const f of files) formData.append('files', f);

            await api.post('/api/platform-feedback/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setJustSubmitted(true);
            resetForm();
            window.setTimeout(() => {
                setIsOpen(false);
                setJustSubmitted(false);
            }, 1800);
        } catch {
            setError(t('feedback.errorGeneric'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!user?.is_superuser) return null;

    return (
        <div className="fixed bottom-5 right-5 z-50">
            {isOpen && (
                <div
                    ref={popoverRef}
                    className="mb-3 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-2xl bg-white dark:bg-slate-900 shadow-2xl shadow-slate-900/20 dark:shadow-black/40 border border-slate-200 dark:border-slate-800 overflow-hidden animate-dropdown"
                >
                    <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-white">
                                {t('feedback.title')}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {t('feedback.subtitle')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                            aria-label={t('feedback.cancel')}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {justSubmitted ? (
                        <div className="px-4 py-8 flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
                                <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-200">
                                {t('feedback.success')}
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setType('bug')}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${type === 'bug'
                                        ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}
                                >
                                    <Bug size={14} />
                                    {t('feedback.typeBug')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('feature')}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${type === 'feature'
                                        ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}
                                >
                                    <Sparkles size={14} />
                                    {t('feedback.typeFeature')}
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    {t('feedback.subjectLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder={t('feedback.subjectPlaceholder')}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    maxLength={255}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                    {t('feedback.descriptionLabel')}
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t('feedback.descriptionPlaceholder')}
                                    rows={4}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                                        {t('feedback.attachmentsLabel')}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                                    >
                                        <Paperclip size={12} />
                                        {t('feedback.attachFiles')}
                                    </button>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    onChange={handleFilesPicked}
                                    className="hidden"
                                />
                                {files.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                        {t('feedback.attachmentsHint')}
                                    </p>
                                ) : (
                                    <ul className="space-y-1">
                                        {files.map((f, idx) => (
                                            <li
                                                key={`${f.name}-${idx}`}
                                                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60 text-xs"
                                            >
                                                <span className="truncate text-slate-700 dark:text-slate-300">{f.name}</span>
                                                <span className="text-slate-400 shrink-0">{formatBytes(f.size)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(idx)}
                                                    className="text-slate-400 hover:text-red-500 shrink-0"
                                                    aria-label="remove"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {error && (
                                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                            )}

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    disabled={isSubmitting}
                                >
                                    {t('feedback.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
                                >
                                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                                    {t('feedback.submit')}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            <button
                type="button"
                onClick={isOpen ? () => setIsOpen(false) : handleOpen}
                className="group flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all"
                aria-label={t('feedback.bubbleTitle')}
                title={t('feedback.bubbleTitle')}
            >
                <MessageSquarePlus size={18} />
                <span className="text-sm font-medium hidden sm:inline">
                    {t('feedback.bubbleTitle')}
                </span>
            </button>
        </div>
    );
};
