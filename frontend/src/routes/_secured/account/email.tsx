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
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                        {t('account.email.title')}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">{t('account.email.subtitle')}</p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                    <Mail size={24} />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden mb-8 transition-all hover:shadow-2xl duration-300">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {emails.map((email) => (
                        <div key={email.email} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${email.verified
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'}`}>
                                        {email.verified ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                            {email.email}
                                            {email.primary && (
                                                <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-0.5 rounded-full font-bold border border-indigo-200 dark:border-indigo-800">
                                                    {t('account.email.primary')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                            {email.verified ? t('account.email.verified') : t('account.email.unverifiedHint')}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                    {!email.primary && email.verified && (
                                        <button
                                            onClick={() => handlePrimary(email.email)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                            title={t('account.email.makePrimary')}
                                        >
                                            <Star size={18} />
                                        </button>
                                    )}
                                    {!email.primary && (
                                        <button
                                            onClick={() => handleDeleteClick(email.email)}
                                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                            title={t('account.email.remove')}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!email.verified && (
                                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
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
                                            className="flex-1 px-4 py-2 border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                            maxLength={6}
                                        />
                                        <button
                                            onClick={() => handleVerifyCode(email.email)}
                                            disabled={verifyingCode || (verifyingEmail === email.email && !verificationCode.trim())}
                                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
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
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            {t('account.email.noEmails')}
                        </div>
                    )}
                </div>
            </div>

            {successMessage && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-2xl text-sm border border-green-100 dark:border-green-900/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle size={20} />
                    <span className="font-medium">{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-sm border border-red-100 dark:border-red-900/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                    <AlertCircle size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}

            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 transition-colors">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Plus size={20} className="text-indigo-600 dark:text-indigo-400" />
                    {t('account.email.addTitle')}
                </h3>
                <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        placeholder={t('account.email.addPlaceholder')}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-8 py-3 bg-gray-900 dark:bg-indigo-600 text-white font-bold rounded-xl hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95 duration-200"
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
