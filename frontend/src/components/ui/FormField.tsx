import React, { useId } from 'react';

export interface FormFieldProps {
    /** Visible label above the input. */
    label?: React.ReactNode;
    /** Marks the field as required (renders a red asterisk next to the label). */
    required?: boolean;
    /** Short helper text shown below the input. Hidden when `error` is present. */
    help?: React.ReactNode;
    /** Inline error message. Takes precedence over `help`. */
    error?: React.ReactNode;
    /** Trailing content next to the label (e.g. small link, icon). */
    labelAddon?: React.ReactNode;
    /** Extra className on the outer wrapper. */
    className?: string;
    /** Force an id on the inner control (otherwise auto-generated). */
    htmlFor?: string;
    children: React.ReactElement;
}

/**
 * Shared form field primitive: handles label, required marker, helper/error, and passes an id to the child control.
 *
 * Usage:
 *   <FormField label="E-posta" required error={errors.email} help="Giriş için kullanılır">
 *     <input type="email" className="..." />
 *   </FormField>
 */
export const FormField: React.FC<FormFieldProps> = ({
    label,
    required,
    help,
    error,
    labelAddon,
    className,
    htmlFor,
    children,
}) => {
    const generatedId = useId();
    const childAny = children as React.ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
    const fieldId = htmlFor ?? childAny.props?.id ?? generatedId;
    const describedById = error || help ? `${fieldId}-desc` : undefined;

    const child = React.cloneElement(childAny, {
        id: fieldId,
        'aria-invalid': error ? true : childAny.props?.['aria-invalid'],
        'aria-describedby': describedById ?? childAny.props?.['aria-describedby'],
    });

    return (
        <div className={className}>
            {label !== undefined && (
                <div className="flex items-baseline justify-between mb-1.5">
                    <label
                        htmlFor={fieldId}
                        className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                        {label}
                        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
                    </label>
                    {labelAddon && <span className="text-xs text-slate-400">{labelAddon}</span>}
                </div>
            )}
            {child}
            {(error || help) && (
                <p
                    id={describedById}
                    className={`mt-1 text-xs ${error ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}
                >
                    {error ?? help}
                </p>
            )}
        </div>
    );
};

/** Shared baseline input className so every `<input>`, `<select>`, `<textarea>` in forms looks identical. */
export const formControlClass =
    'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-60 disabled:cursor-not-allowed aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-400';
