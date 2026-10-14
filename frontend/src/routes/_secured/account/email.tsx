import { ALLAUTH_API } from '@/modules/allauth/data'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Mail, Plus, ShieldCheck, Star, Trash2, CheckCircle } from 'lucide-react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'

export const Route = createFileRoute('/_secured/account/email')({
    component: EmailManagement,
    staleTime: 10000,
    loader: async () => {
        try {
            const data = await ALLAUTH_API.getEmailAddresses()
            return { emails: Array.isArray(data.data) ? data.data : [] }
        } catch {
            return { emails: [] }
        }
    },
})

interface EmailAddress {
    email: string
    verified: boolean
    primary: boolean
}

// Local types to avoid `any` scattered across the file
type AllauthErrorEntry = { message?: string }
type AllauthResponse = {
    status: number
    data?: { flows?: Array<{ id?: string }> }
    errors?: AllauthErrorEntry[]
}
type AxiosLikeError = {
    response?: { status?: number; data?: { errors?: AllauthErrorEntry[]; data?: { flows?: Array<{ id?: string }> } } }
    message?: string
}

const isReauthFlow = (res?: AllauthResponse, err?: AxiosLikeError) =>
    res?.data?.flows?.some(f => f.id === 'reauthenticate')
    || err?.response?.data?.data?.flows?.some(f => f.id === 'reauthenticate')

function EmailManagement() {
    const { t } = useTranslation()
    const { emails: initialEmails } = Route.useLoaderData()
    const navigate = useNavigate()
    const [emails, setEmails] = useState<EmailAddress[]>(initialEmails as EmailAddress[])
    const [newEmail, setNewEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; email: string | null }>({ isOpen: false, email: null })

    const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null)
    const [verificationCode, setVerificationCode] = useState('')
    const [verifyingCode, setVerifyingCode] = useState(false)
    const [verificationStatus, setVerificationStatus] = useState<{ email: string; message: string; type: 'success' | 'error' } | null>(null)

    const refreshEmails = async () => {
        try {
            const data = await ALLAUTH_API.getEmailAddresses()
            if (data.status === 200 && Array.isArray(data.data)) {
                setEmails(data.data as EmailAddress[])
            }
        } catch (e) {
            console.error(e)
        }
    }

    const pickMessage = (res?: AllauthResponse, err?: AxiosLikeError, fallback = '') =>
        res?.errors?.[0]?.message
        || err?.response?.data?.errors?.[0]?.message
        || err?.message
        || fallback

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccessMessage(null)
        setVerificationStatus(null)
        try {
            const res = await ALLAUTH_API.addEmail(newEmail)
            if (res.status === 200) {
                const added = newEmail
                setNewEmail('')
                setSuccessMessage(t('account.email.addedToast', { email: added }))
                await refreshEmails()
            } else if (res.status === 429) {
                setError(t('account.email.tooManyRequests'))
            } else {
                setError(pickMessage(res as AllauthResponse, undefined, t('account.email.addFailed')))
            }
        } catch (err: unknown) {
            const e = err as AxiosLikeError
            if (e.response?.status === 429) setError(t('account.email.tooManyRequests'))
            else setError(pickMessage(undefined, e, t('account.email.addFailed')))
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteClick = (email: string) => setDeleteModal({ isOpen: true, email })

    const handleConfirmDelete = async () => {
        if (!deleteModal.email) return
        const target = deleteModal.email
        setLoading(true)
        setError(null)
        setSuccessMessage(null)
        setVerificationStatus(null)
        try {
            await ALLAUTH_API.deleteEmail(target)
            setSuccessMessage(t('account.email.removedToast', { email: target }))
            await refreshEmails()
            setDeleteModal({ isOpen: false, email: null })
        } catch (err: unknown) {
            const e = err as AxiosLikeError
            if (e.response?.status === 429) setError(t('account.email.tooManyRequests'))
            else setError(pickMessage(undefined, e, t('account.email.removeFailed')))
        } finally {
            setLoading(false)
        }
    }

    const handlePrimary = async (email: string) => {
        setError(null)
        setSuccessMessage(null)
        setVerificationStatus(null)
        try {
            const res = await ALLAUTH_API.markEmailAsPrimary(email)
            if (res.status === 200) {
                await refreshEmails()
                setSuccessMessage(t('account.email.primaryUpdated'))
            } else if (res.status === 429) {
                setError(t('account.email.tooManyRequests'))
            } else {
                setError(pickMessage(res as AllauthResponse, undefined, t('account.email.primaryFailed')))
            }
        } catch (err: unknown) {
            const e = err as AxiosLikeError
            if (e.response?.status === 429) setError(t('account.email.tooManyRequests'))
            else setError(pickMessage(undefined, e, t('account.email.primaryFailed')))
        }
    }

    const handleRequestVerification = async (email: string) => {
        setVerificationStatus(null)
        try {
            const res = await ALLAUTH_API.requestEmailVerification(email)
            if (res.status === 200) {
                setVerifyingEmail(email)
                setVerificationCode('')
                setVerificationStatus({ email, message: t('account.email.codeSent', { email }), type: 'success' })
            } else if ((res.status === 401 || res.status === 403) && isReauthFlow(res as AllauthResponse)) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (res.status === 429) {
                setVerificationStatus({ email, message: t('account.email.tooManyRequests'), type: 'error' })
            } else {
                setVerificationStatus({
                    email,
                    message: pickMessage(res as AllauthResponse, undefined, t('account.email.sendCodeFailed')),
                    type: 'error',
                })
            }
        } catch (err: unknown) {
            const e = err as AxiosLikeError
            if ((e.response?.status === 401 || e.response?.status === 403) && isReauthFlow(undefined, e)) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (e.response?.status === 429) {
                setVerificationStatus({ email, message: t('account.email.tooManyRequests'), type: 'error' })
            } else {
                setVerificationStatus({
                    email,
                    message: pickMessage(undefined, e, t('account.email.sendCodeFailed')),
                    type: 'error',
                })
            }
        }
    }

    const handleVerifyCode = async (email: string) => {
        if (!verificationCode.trim()) return
        setVerifyingCode(true)
        setVerificationStatus(null)
        try {
            const res = await ALLAUTH_API.verifyEmailByCode(verificationCode)
            if (res.status === 200) {
                setVerificationStatus({ email, message: t('account.email.verifiedToast', { email }), type: 'success' })
                setVerifyingEmail(null)
                setVerificationCode('')
                await refreshEmails()
            } else if ((res.status === 401 || res.status === 403) && isReauthFlow(res as AllauthResponse)) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (res.status === 429) {
                setVerificationStatus({ email, message: t('account.email.tooManyRequests'), type: 'error' })
            } else {
                setVerificationStatus({
                    email,
                    message: pickMessage(res as AllauthResponse, undefined, t('account.email.verifyCodeFailed')),
                    type: 'error',
                })
            }
        } catch (err: unknown) {
            const e = err as AxiosLikeError
            if ((e.response?.status === 401 || e.response?.status === 403) && isReauthFlow(undefined, e)) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (e.response?.status === 429) {
                setVerificationStatus({ email, message: t('account.email.tooManyRequests'), type: 'error' })
            } else {
                setVerificationStatus({
                    email,
                    message: pickMessage(undefined, e, t('account.email.verifyCodeFailed')),
                    type: 'error',
                })
            }
        } finally {
            setVerifyingCode(false)
        }
    }

    return (
        <div className="w-full min-w-0 max-w-3xl space-y-6">
            <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                        {t('account.email.title')}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('account.email.subtitle')}</p>
                </div>
                <Mail size={22} className="shrink-0 text-slate-400 dark:text-slate-500" />
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden mb-6">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {emails.map((email) => (
                        <div key={email.email} className="p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className={`shrink-0 ${email.verified
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-amber-600 dark:text-amber-400'}`}>
                                        {email.verified ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap break-all">
                                            {email.email}
                                            {email.primary && (
                                                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs px-2 py-0.5 rounded-md font-medium border border-slate-200 dark:border-slate-700">
                                                    {t('account.email.primary')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                            {email.verified ? t('account.email.verified') : t('account.email.unverifiedHint')}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                    {!email.primary && email.verified && (
                                        <button
                                            onClick={() => handlePrimary(email.email)}
                                            className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                            title={t('account.email.makePrimary')}
                                        >
                                            <Star size={18} />
                                        </button>
                                    )}
                                    {!email.primary && (
                                        <button
                                            onClick={() => handleDeleteClick(email.email)}
                                            className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                            title={t('account.email.remove')}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!email.verified && (
                                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg">
                                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                                        {t('account.email.enterCodeHint')}
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            placeholder={t('account.email.codePlaceholder')}
                                            value={verifyingEmail === email.email ? verificationCode : ''}
                                            onChange={(e) => {
                                                setVerifyingEmail(email.email)
                                                setVerificationCode(e.target.value)
                                            }}
                                            className="flex-1 min-w-0 px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                            maxLength={6}
                                        />
                                        <button
                                            onClick={() => handleVerifyCode(email.email)}
                                            disabled={verifyingCode || (verifyingEmail === email.email && !verificationCode.trim())}
                                            className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {verifyingCode && verifyingEmail === email.email ? t('account.email.verifying') : t('account.email.verifyCode')}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handleRequestVerification(email.email)}
                                        className="mt-2 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline"
                                    >
                                        {t('account.email.resendCode')}
                                    </button>

                                    {verificationStatus && verificationStatus.email === email.email && (
                                        <p className={`mt-2 text-xs font-medium ${verificationStatus.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} flex items-center gap-1.5`}>
                                            {verificationStatus.type === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                            {verificationStatus.message}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {emails.length === 0 && (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            {t('account.email.noEmails')}
                        </div>
                    )}
                </div>
            </div>

            {successMessage && (
                <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm border border-green-100 dark:border-green-900/30 flex items-center gap-3">
                    <CheckCircle size={20} />
                    <span className="font-medium">{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm border border-red-100 dark:border-red-900/30 flex items-center gap-3">
                    <AlertCircle size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Plus size={18} className="text-slate-500 dark:text-slate-400" />
                    {t('account.email.addTitle')}
                </h3>
                <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="flex-1 min-w-0 px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-colors text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        placeholder={t('account.email.addPlaceholder')}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? t('account.email.adding') : t('account.email.addBtn')}
                    </button>
                </form>
            </div>

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, email: null })}
                onConfirm={handleConfirmDelete}
                title={t('account.email.deleteTitle')}
                message={t('account.email.deleteMessage', { email: deleteModal.email || '' })}
                confirmText={t('account.email.yesRemove')}
                isLoading={loading}
                type="danger"
            />
        </div>
    )
}
