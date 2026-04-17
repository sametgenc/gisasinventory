import React from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';

export interface FormFooterProps {
    /** Primary action label. Defaults to t('common.save'). */
    primaryLabel?: React.ReactNode;
    /** Cancel action label. Defaults to t('common.cancel'). */
    cancelLabel?: React.ReactNode;
    /** Primary click handler. When omitted, primary falls back to form submit behaviour (`type=submit`). */
    onPrimary?: () => void;
    /** Cancel click handler. When omitted, the cancel button is hidden. */
    onCancel?: () => void;
    /** Shows a spinner and disables primary. */
    loading?: boolean;
    /** Disables the primary button. */
    disabled?: boolean;
    /** Visual style for the primary button. Default `primary` (blue). */
    variant?: 'primary' | 'danger';
    /** If true, renders the primary as `type=submit` so the parent `<form>` handles submit. */
    asSubmit?: boolean;
    /**
     * Form id to associate the submit button with. Allows the footer to live
     * outside the `<form>` element (e.g. inside `Modal`'s `footer` slot).
     * Requires `asSubmit`.
     */
    formId?: string;
    /** Optional leading icon on the primary button. Defaults to Save. Pass `null` to hide. */
    icon?: React.ReactNode | null;
    /** Extra content rendered on the left side of the footer (e.g. "Back" link). */
    leading?: React.ReactNode;
    /**
     * Placement mode:
     * - `modal` (default): placed inside `Modal`'s `footer` slot as a flex child
     *   (NOT sticky). Guaranteed to never overlap body content. Use this
     *   whenever the form is rendered inside `<Modal>`.
     * - `sticky`: legacy behaviour — `position: sticky` at the bottom of the
     *   scroll container. Only use this for non-modal pages.
     */
    placement?: 'modal' | 'sticky';
    className?: string;
}

/**
 * Footer row for forms. In the default `modal` placement, render it inside
 * `<Modal footer={<FormFooter ... />}>` so the modal's flex layout keeps the
 * action bar fixed at the bottom without overlapping body content.
 */
export const FormFooter: React.FC<FormFooterProps> = ({
    primaryLabel,
    cancelLabel,
    onPrimary,
    onCancel,
    loading = false,
    disabled = false,
    variant = 'primary',
    asSubmit = false,
    formId,
    icon,
    leading,
    placement = 'modal',
    className = '',
}) => {
    const { t } = useTranslation();

    const primary = primaryLabel ?? t('common.save');
    const cancel = cancelLabel ?? t('common.cancel');

    const primaryClass = variant === 'danger'
        ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
        : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';

    const leadingIcon = icon === null ? null : (icon ?? <Save size={16} />);

    // In `modal` mode the footer is a regular layout row (parent owns the
    // border/background); in `sticky` mode we overlay the scrollable content.
    const wrapperClass = placement === 'sticky'
        ? `sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.08)] dark:shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.4)] flex items-center gap-2`
        : `px-5 py-3 flex items-center gap-2`;

    return (
        <div className={`${wrapperClass} ${className}`}>
            <div className="flex-1 min-w-0 text-sm text-slate-500">{leading}</div>
            {onCancel && (
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                    {cancel}
                </button>
            )}
            <button
                type={asSubmit ? 'submit' : 'button'}
                form={asSubmit ? formId : undefined}
                onClick={asSubmit ? undefined : onPrimary}
                disabled={loading || disabled}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${primaryClass}`}
            >
                {loading
                    ? <div className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                    : leadingIcon}
                {primary}
            </button>
        </div>
    );
};
