import React, { useEffect, useRef } from 'react'

interface OtpInputProps {
    value: string
    onChange: (value: string) => void
    length?: number
    autoFocus?: boolean
    disabled?: boolean
    onComplete?: (value: string) => void
}

const sanitize = (s: string) => s.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()

export function OtpInput({
    value,
    onChange,
    length = 6,
    autoFocus = true,
    disabled = false,
    onComplete,
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
        <div className="flex justify-center gap-2" role="group" aria-label="One-time code">
            {cells.map((char, index) => (
                <input
                    key={index}
                    ref={(el) => { inputsRef.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9a-zA-Z]*"
                    maxLength={1}
                    disabled={disabled}
                    value={char}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={(e) => handlePaste(index, e)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={`Digit ${index + 1}`}
                    className="w-11 h-12 sm:w-12 sm:h-13 text-center text-xl font-semibold font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all disabled:opacity-50"
                />
            ))}
        </div>
    )
}
