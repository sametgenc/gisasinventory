import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'

interface DraftGuardOptions {
    dirty: boolean
    busy?: boolean
    active?: boolean
    onClose: () => void
    confirmationCopy?: { title?: string; message?: string; confirmText?: string }
}

interface PendingDiscard {
    discard: () => void
    keep?: () => void
}

const departureGuards = new Set<() => Promise<boolean>>()

/** Ask before an action clears the session and unmounts forms without routing. */
export async function confirmDraftDeparture(): Promise<boolean> {
    for (const guard of [...departureGuards]) {
        if (departureGuards.has(guard) && !await guard()) return false
    }
    return true
}

/** Keeps form data in its owning component until the user explicitly discards it. */
export function useDraftGuard({ dirty, busy = false, active = true, onClose, confirmationCopy }: DraftGuardOptions) {
    const { t } = useTranslation()
    const router = useRouter({ warn: false })
    const [confirming, setConfirming] = useState(false)
    const pending = useRef<PendingDiscard | null>(null)
    const allowNextNavigation = useRef(false)

    const prepareAction = useCallback((action: () => void, navigates: boolean) => {
        if (busy) return
        if (!active || !dirty) { action(); return }
        if (pending.current) return
        pending.current = { discard: () => {
            allowNextNavigation.current = navigates
            action()
            // A local tab/method change must never authorize a later navigation.
            queueMicrotask(() => { allowNextNavigation.current = false })
        } }
        setConfirming(true)
    }, [active, busy, dirty])

    const requestAction = useCallback((action: () => void, options?: { navigates?: boolean }) => prepareAction(action, options?.navigates ?? false), [prepareAction])
    const requestClose = useCallback(() => prepareAction(onClose, false), [onClose, prepareAction])
    const keepEditing = useCallback(() => {
        const current = pending.current
        pending.current = null
        setConfirming(false)
        current?.keep?.()
    }, [])
    const discard = useCallback(() => {
        if (busy) return
        const current = pending.current
        pending.current = null
        setConfirming(false)
        current?.discard()
    }, [busy])

    useEffect(() => {
        if (!active || (!dirty && !busy)) return
        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [active, dirty, busy])

    useEffect(() => {
        if (!active || (!dirty && !busy)) return
        const guard = () => {
            if (busy || pending.current) return Promise.resolve(false)
            return new Promise<boolean>(resolve => {
                pending.current = { discard: () => resolve(true), keep: () => resolve(false) }
                setConfirming(true)
            })
        }
        departureGuards.add(guard)
        return () => { departureGuards.delete(guard) }
    }, [active, dirty, busy])

    useEffect(() => {
        if (!router || !active || (!dirty && !busy)) return
        return router.history.block({
            enableBeforeUnload: false,
            blockerFn: () => {
                if (allowNextNavigation.current) { allowNextNavigation.current = false; return false }
                if (busy || pending.current) return true
                return new Promise<boolean>(resolve => {
                    pending.current = { discard: () => resolve(false), keep: () => resolve(true) }
                    setConfirming(true)
                })
            },
        })
    }, [router, active, dirty, busy])

    useEffect(() => () => { pending.current?.keep?.() }, [])

    return {
        requestClose,
        requestAction,
        confirmation: <ConfirmationModal
            isOpen={confirming}
            onClose={keepEditing}
            onConfirm={discard}
            title={confirmationCopy?.title ?? t('common.unsavedTitle', 'Discard unsaved changes?')}
            message={confirmationCopy?.message ?? t('common.unsavedMessage', 'Your changes have not been saved. Discard them and close?')}
            cancelText={t('common.keepEditing', 'Keep editing')}
            confirmText={confirmationCopy?.confirmText ?? t('common.discardChanges', 'Discard changes')}
            isLoading={busy}
        />,
    }
}
