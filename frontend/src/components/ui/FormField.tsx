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
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <label
                        htmlFor={fieldId}
                        className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                        {label}
                        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
                    </label>
                    {labelAddon && <span className="text-xs text-slate-500 dark:text-slate-400">{labelAddon}</span>}
                </div>
            )}
            {child}
            {(error || help) && (
                <p
                    id={describedById}
                    className={`mt-1.5 text-xs leading-5 ${error ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    {error ?? help}
                </p>
            )}
        </div>
    );
};

/** Shared baseline input className so every `<input>`, `<select>`, `<textarea>` in forms looks identical. */
export const formControlClass =
    'w-full min-h-10 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-600 dark:focus:border-blue-400 transition-colors disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 disabled:cursor-not-allowed aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-400/25';
