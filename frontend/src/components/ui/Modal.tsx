import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    /**
     * Optional sticky footer slot. When supplied, the modal becomes a
     * flex-column layout: header + scrollable body + fixed footer. The footer
     * is part of the layout (not `position: sticky`) so it can never overlap
     * content.
     */
    footer?: React.ReactNode;
    /** Prevent dismissal while a write or download is still in progress. */
    closeDisabled?: boolean;
}

const sizeClasses: Record<string, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

const openDialogs: HTMLElement[] = [];
let originalBodyOverflow = '';

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'lg',
    footer,
    closeDisabled = false,
}) => {
    const { t } = useTranslation();
    const modalRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const closeRef = useRef({ onClose, closeDisabled });

    useEffect(() => { closeRef.current = { onClose, closeDisabled }; }, [onClose, closeDisabled]);

    useEffect(() => {
        if (!isOpen || !modalRef.current) return;
        const dialog = modalRef.current;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (openDialogs.length === 0) originalBodyOverflow = document.body.style.overflow;
        openDialogs.push(dialog);
        document.body.style.overflow = 'hidden';
        const isTopDialog = () => openDialogs.at(-1) === dialog;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isTopDialog()) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                if (!closeRef.current.closeDisabled) closeRef.current.onClose();
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
            )).filter(control => control.getClientRects().length > 0 && control.tabIndex >= 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (!first || !last) {
                event.preventDefault(); dialog.focus(); return;
            }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
                event.preventDefault(); first.focus();
            }
        };
        const containFocus = (event: FocusEvent) => {
            if (isTopDialog() && event.target instanceof Node && !dialog.contains(event.target)) dialog.focus();
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('focusin', containFocus);
        const frame = requestAnimationFrame(() => { if (isTopDialog() && !dialog.contains(document.activeElement)) dialog.focus(); });
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('focusin', containFocus);
            const wasTopDialog = isTopDialog();
            const index = openDialogs.indexOf(dialog);
            if (index >= 0) openDialogs.splice(index, 1);
            if (!openDialogs.length) document.body.style.overflow = originalBodyOverflow;
            if (wasTopDialog && previousFocus?.isConnected) previousFocus.focus();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const overlay = (
        <div className="fixed inset-0 z-50 overflow-y-auto print:hidden">
            <div
                className="fixed inset-0 bg-slate-950/50"
                onClick={() => { if (!closeDisabled) onClose(); }}
            />
            <div className="relative min-h-full flex items-center justify-center p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
                <div
                    ref={modalRef}
                    className={`relative bg-white dark:bg-slate-900 rounded-md border border-slate-300 dark:border-slate-600 w-full ${sizeClasses[size]} max-h-[90dvh] overflow-hidden animate-dropdown flex flex-col focus:outline-none`}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-busy={closeDisabled || undefined}
                    tabIndex={-1}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                        <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('common.close')}
                            disabled={closeDisabled}
                            className="shrink-0 p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Body (scrolls) */}
                    <div className="p-5 overflow-y-auto flex-1 min-h-0">
                        {children}
                    </div>

                    {/* Optional fixed footer */}
                    {footer && (
                        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
};
