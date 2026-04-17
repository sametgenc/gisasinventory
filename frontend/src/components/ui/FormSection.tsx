import React from 'react';

export interface FormSectionProps {
    /** Section title shown as a small uppercase heading. */
    title?: React.ReactNode;
    /** Short helper paragraph below the title. */
    description?: React.ReactNode;
    /** Trailing content on the header row (e.g. action button). */
    actions?: React.ReactNode;
    /** Layout for immediate children. `grid` renders a 2-col responsive grid. Default: `stack`. */
    layout?: 'stack' | 'grid';
    className?: string;
    children: React.ReactNode;
}

/**
 * Shared titled group inside a form. Use one per logical section.
 *
 *   <FormSection title="Kimlik" description="Kullanıcının temel bilgileri">
 *     <FormField ...><input /></FormField>
 *     <FormField ...><input /></FormField>
 *   </FormSection>
 */
export const FormSection: React.FC<FormSectionProps> = ({
    title,
    description,
    actions,
    layout = 'stack',
    className = '',
    children,
}) => {
    const bodyClass = layout === 'grid'
        ? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
        : 'space-y-4';

    return (
        <section className={`space-y-3 ${className}`}>
            {(title || description || actions) && (
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {title && (
                            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                {title}
                            </h3>
                        )}
                        {description && (
                            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                        )}
                    </div>
                    {actions && <div className="shrink-0">{actions}</div>}
                </div>
            )}
            <div className={bodyClass}>{children}</div>
        </section>
    );
};
