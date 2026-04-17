import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    type = 'danger',
    isLoading = false,
}) => {
    const { t } = useTranslation();
    const modalRef = useRef<HTMLDivElement>(null);

    const resolvedConfirmText = confirmText ?? t('common.confirm');
    const resolvedCancelText = cancelText ?? t('common.cancel');
    const processingText = t('common.processing', 'İşleniyor...');

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
            setTimeout(() => modalRef.current?.focus(), 50);
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const iconColors = {
        danger: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        info: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
    };

    const buttonColors = {
        danger: 'bg-red-600 hover:bg-red-700',
        warning: 'bg-amber-600 hover:bg-amber-700',
        info: 'bg-indigo-600 hover:bg-indigo-700',
    };

    const overlay = (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div
                ref={modalRef}
                className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-md w-full overflow-hidden animate-dropdown"
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
            >
                <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div className={`p-2.5 rounded-lg ${iconColors[type]}`}>
                            <AlertTriangle size={20} />
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1.5">{title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                        {message}
                    </p>

                    <div className="flex items-center gap-2 justify-end">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {resolvedCancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={`px-4 py-2 text-sm text-white font-medium rounded-lg shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${buttonColors[type]}`}
                        >
                            {isLoading ? processingText : resolvedConfirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
};
