import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';

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
    error?: string | null;
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
    error,
}) => {
    const { t } = useTranslation();

    const resolvedConfirmText = confirmText ?? t('common.confirm');
    const resolvedCancelText = cancelText ?? t('common.cancel');
    const processingText = t('common.processing');

    const iconColors = {
        danger: 'text-red-700 dark:text-red-300',
        warning: 'text-amber-700 dark:text-amber-300',
        info: 'text-blue-700 dark:text-blue-300',
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" closeDisabled={isLoading}>
            <div className="flex items-start mb-4">
                <AlertTriangle size={22} className={iconColors[type]} />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-6">{message}</p>
            {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
            <div className="flex flex-wrap items-center gap-2 justify-end">
                <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                    {resolvedCancelText}
                </Button>
                <Button variant={type === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={isLoading}>
                    {isLoading ? processingText : resolvedConfirmText}
                </Button>
            </div>
        </Modal>
    );
};
