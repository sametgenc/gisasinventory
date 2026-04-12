import { ALLAUTH_API } from '@/modules/allauth/data'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Mail, Plus, ShieldCheck, Star, Trash2, CheckCircle } from 'lucide-react'
import React, { useState } from 'react'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'

export const Route = createFileRoute('/_secured/account/email')({
    component: EmailManagement,
    staleTime: 10000,
    loader: async () => {
        try {
            const data = await ALLAUTH_API.getEmailAddresses()
            return { emails: Array.isArray(data.data) ? data.data : [] }
        } catch (e) {
            return { emails: [] }
        }
    },
})

interface EmailAddress {
    email: string
    verified: boolean
    primary: boolean
}

function EmailManagement() {
    const { emails: initialEmails } = Route.useLoaderData()
    const navigate = useNavigate()
    const [emails, setEmails] = useState<EmailAddress[]>(initialEmails as EmailAddress[])
    const [newEmail, setNewEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; email: string | null }>({ isOpen: false, email: null })

    // Code verification state
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

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccessMessage(null)
        setVerificationStatus(null)
        try {
            const res = await ALLAUTH_API.addEmail(newEmail)
            if (res.status === 200) {
                setNewEmail('')
                setSuccessMessage(`Email ${newEmail} added.`)
                await refreshEmails()
            } else if (res.status === 429) {
                setError('Too many requests. Please try again later.')
            } else {
                setError(res.errors?.[0]?.message || 'Failed to add email.')
            }
        } catch (err: any) {
            if (err.response?.status === 429) {
                setError('Too many requests. Please try again later.')
            } else {
                setError(err.response?.data?.errors?.[0]?.message || err.message || 'Failed to add email.')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteClick = (email: string) => {
        setDeleteModal({ isOpen: true, email })
    }

    const handleConfirmDelete = async () => {
        if (!deleteModal.email) return
        setLoading(true)
        setError(null)
        setSuccessMessage(null)
        setVerificationStatus(null)
        try {
            await ALLAUTH_API.deleteEmail(deleteModal.email)
            setSuccessMessage(`Email ${deleteModal.email} removed.`)
            await refreshEmails()
            setDeleteModal({ isOpen: false, email: null })
        } catch (err: any) {
            if (err.response?.status === 429) {
                setError('Too many requests. Please try again later.')
            } else {
                setError(err.response?.data?.errors?.[0]?.message || err.message || 'Failed to remove email.')
            }
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
                setSuccessMessage('Primary email updated.')
            } else if (res.status === 429) {
                setError('Too many requests. Please try again later.')
            } else {
                setError(res.errors?.[0]?.message || 'Failed to update primary email.')
            }
        } catch (err: any) {
            if (err.response?.status === 429) {
                setError('Too many requests. Please try again later.')
            } else {
                setError(err.response?.data?.errors?.[0]?.message || err.message || 'Failed to update primary email.')
            }
        }
    }

    const handleRequestVerification = async (email: string) => {
        setVerificationStatus(null)
        try {
            const res = await ALLAUTH_API.requestEmailVerification(email)
            if (res.status === 200) {
                setVerifyingEmail(email)
                setVerificationCode('')
                setVerificationStatus({ email, message: `Verification code sent to ${email}.`, type: 'success' })
            } else if ((res.status === 401 || res.status === 403) && res.data?.flows?.some((f: any) => f.id === 'reauthenticate')) {
                // Reauthentication required - redirect
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (res.status === 429) {
                setVerificationStatus({ email, message: 'Too many requests. Please try again later.', type: 'error' })
            } else {
                const errorMessage = res.errors?.[0]?.message || 'Failed to send verification code'
                setVerificationStatus({ email, message: errorMessage, type: 'error' })
            }
        } catch (err: any) {
            const data = err.response?.data
            if ((err.response?.status === 401 || err.response?.status === 403) && data?.data?.flows?.some((f: any) => f.id === 'reauthenticate')) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (err.response?.status === 429) {
                setVerificationStatus({ email, message: 'Too many requests. Please try again later.', type: 'error' })
            } else {
                const errorMessage = err.response?.data?.errors?.[0]?.message || err.message || 'Failed to send verification code'
                setVerificationStatus({ email, message: errorMessage, type: 'error' })
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
                setVerificationStatus({ email, message: `${email} verified successfully!`, type: 'success' })
                setVerifyingEmail(null)
                setVerificationCode('')
                await refreshEmails()
            } else if ((res.status === 401 || res.status === 403) && res.data?.flows?.some((f: any) => f.id === 'reauthenticate')) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (res.status === 429) {
                setVerificationStatus({ email, message: 'Too many requests. Please try again later.', type: 'error' })
            } else {
                const errorMessage = res.errors?.[0]?.message || 'Invalid verification code'
                setVerificationStatus({ email, message: errorMessage, type: 'error' })
            }
        } catch (err: any) {
            const data = err.response?.data
            if ((err.response?.status === 401 || err.response?.status === 403) && data?.data?.flows?.some((f: any) => f.id === 'reauthenticate')) {
                navigate({ to: '/auth/reauthenticate', search: { next: '/account/email' } })
            } else if (err.response?.status === 429) {
                setVerificationStatus({ email, message: 'Too many requests. Please try again later.', type: 'error' })
            } else {
                const errorMessage = err.response?.data?.errors?.[0]?.message || err.message || 'Failed to verify email'
                setVerificationStatus({ email, message: errorMessage, type: 'error' })
            }
        } finally {
            setVerifyingCode(false)
        }
    }

    return (
        <div className="w-full min-w-0 max-w-3xl space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Email Addresses</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">Manage the email addresses associated with your account.</p>
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
                                    <div className={`p-2 rounded-lg ${email.verified ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'}`}>
                                        {email.verified ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                            {email.email}
                                            {email.primary && (
                                                <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-0.5 rounded-full font-bold border border-indigo-200 dark:border-indigo-800">
                                                    Primary
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                            {email.verified ? 'Verified' : 'Unverified - Enter verification code below'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                    {!email.primary && email.verified && (
                                        <button
                                            onClick={() => handlePrimary(email.email)}
                                            className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                                            title="Make Primary"
                                        >
                                            <Star size={18} />
                                        </button>
                                    )}
                                    {!email.primary && (
                                        <button
                                            onClick={() => handleDeleteClick(email.email)}
                                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                            title="Remove"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Code verification input for unverified emails - shown immediately */}
                            {!email.verified && (
                                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl">
                                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                                        Enter the 6-digit verification code sent to your email.
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            placeholder="Enter 6-digit code"
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
                                            {verifyingCode && verifyingEmail === email.email ? 'Verifying...' : 'Verify Code'}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handleRequestVerification(email.email)}
                                        className="mt-2 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline"
                                    >
                                        Didn't receive the code? Resend
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
                            No email addresses found.
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
                    Add Email Address
                </h3>
                <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        placeholder="Enter a new email address..."
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-8 py-3 bg-gray-900 dark:bg-indigo-600 text-white font-bold rounded-xl hover:bg-black dark:hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95 duration-200"
                    >
                        {loading ? 'Adding...' : 'Add Email'}
                    </button>
                </form>
            </div>

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, email: null })}
                onConfirm={handleConfirmDelete}
                title="Remove Email Address?"
                message={`Are you sure you want to remove ${deleteModal.email}? You will no longer be able to use it to login or recover your account.`}
                confirmText="Yes, Remove"
                isLoading={loading}
                type="danger"
            />
        </div>
    )
}
