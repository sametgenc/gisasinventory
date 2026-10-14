import React, { useEffect, useRef } from 'react'

interface OtpInputProps {
    value: string
    onChange: (value: string) => void
    length?: number
    autoFocus?: boolean
    disabled?: boolean
    onComplete?: (value: string) => void
    label?: string
    getCellLabel?: (position: number) => string
}

const sanitize = (s: string) => s.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()

export function OtpInput({
    value,
    onChange,
    length = 6,
    autoFocus = true,
    disabled = false,
    onComplete,
    label = 'One-time code',
    getCellLabel = position => `Character ${position}`,
}: OtpInputProps) {
    const inputsRef = useRef<Array<HTMLInputElement | null>>([])
    const cells = Array.from({ length }, (_, i) => value[i] ?? '')

    useEffect(() => {
        if (autoFocus) inputsRef.current[0]?.focus()
    }, [autoFocus])

    useEffect(() => {
        if (value.length === length) onComplete?.(value)
    }, [value, length, onComplete])

    const setCell = (index: number, char: string) => {
        const chars = value.split('')
        while (chars.length < length) chars.push('')
        chars[index] = char
        const next = chars.join('').slice(0, length)
        onChange(next)
    }

    const handleChange = (index: number, raw: string) => {
        const clean = sanitize(raw)
        if (!clean) {
            setCell(index, '')
            return
        }
        if (clean.length === 1) {
            setCell(index, clean)
            inputsRef.current[Math.min(index + 1, length - 1)]?.focus()
            return
        }
        const chars = value.split('')
        for (let i = 0; i < clean.length && index + i < length; i += 1) {
            chars[index + i] = clean[i]
        }
        const next = chars.join('').slice(0, length)
        onChange(next)
        const focusIdx = Math.min(index + clean.length, length - 1)
        inputsRef.current[focusIdx]?.focus()
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            if (cells[index]) {
                setCell(index, '')
                return
            }
            if (index > 0) {
                setCell(index - 1, '')
                inputsRef.current[index - 1]?.focus()
            }
            return
        }
        if (e.key === 'ArrowLeft' && index > 0) {
            inputsRef.current[index - 1]?.focus()
        }
        if (e.key === 'ArrowRight' && index < length - 1) {
            inputsRef.current[index + 1]?.focus()
        }
    }

    const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const pasted = sanitize(e.clipboardData.getData('text'))
        if (!pasted) return
        const chars = value.split('')
        for (let i = 0; i < pasted.length && index + i < length; i += 1) {
            chars[index + i] = pasted[i]
        }
        const next = chars.join('').slice(0, length)
        onChange(next)
        const focusIdx = Math.min(index + pasted.length, length - 1)
        inputsRef.current[focusIdx]?.focus()
    }

    return (
        <div className="flex w-full justify-center gap-1.5 sm:gap-2" role="group" aria-label={label}>
            {cells.map((char, index) => (
                <input
                    key={index}
                    ref={(el) => { inputsRef.current[index] = el }}
                    type="text"
                    inputMode="text"
                    autoComplete="one-time-code"
                    pattern="[0-9a-zA-Z]*"
                    maxLength={1}
                    disabled={disabled}
                    value={char}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={(e) => handlePaste(index, e)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={getCellLabel(index + 1)}
                    className="h-12 min-w-0 max-w-12 flex-1 rounded-md border border-slate-300 bg-white text-center font-mono text-xl font-semibold text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
                />
            ))}
        </div>
    )
}
