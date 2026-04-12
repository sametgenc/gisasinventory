import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ALLAUTH_API } from '../data';
import type { Authenticator } from '../types';
import { create, parseCreationOptionsFromJSON } from '@github/webauthn-json/browser-ponyfill';
import { Loader2, Key, Trash2, Edit2, Check, X, Plus } from 'lucide-react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useSensitiveAction } from './useSensitiveAction';

interface WebAuthnManagerProps {
    authenticators: Authenticator[];
    onUpdate: () => void;
}

export const WebAuthnManager: React.FC<WebAuthnManagerProps> = ({ authenticators, onUpdate }) => {
    const navigate = useNavigate();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [isPasswordless, setIsPasswordless] = useState(false); // Default to Security Key (2FA), toggle for Passkey
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
    const { execute } = useSensitiveAction();

    const webauthnAuths = authenticators.filter(a => a.type === 'webauthn');

    const handleAdd = () => {
        execute(async () => {
            setLoading(true);
            setError(null);
            try {
                // Get creation options
                const optRes = await ALLAUTH_API.getWebAuthnCreateOptions(isPasswordless);
                if (optRes.status === 200 && optRes.data?.creation_options) {
                    // Create credential
                    const options = parseCreationOptionsFromJSON(optRes.data.creation_options);
                    const credential = await create(options);

                    // Send to backend
                    const addRes = await ALLAUTH_API.addWebAuthnCredential(newName, credential);
                    if (addRes.status === 200) {
                        setAdding(false);
                        setNewName('');
                        await queryClient.invalidateQueries({ queryKey: ['authenticators'] });
                        await router.invalidate();
                        onUpdate();
                        // Redirect to authenticators list as requested
                        navigate({ to: '/account/authenticators' });
                    } else {
                        setError(addRes.errors?.[0]?.message || 'Failed to add key.');
                    }
                } else {
                    setError(optRes.errors?.[0]?.message || 'Failed to initialize WebAuthn.');
                }
            } catch (e: any) {
                setError(e.message || 'An error occurred.');
            } finally {
                setLoading(false);
            }
        });
    };

    const handleDeleteClick = (id: string) => {
        setDeleteModal({ isOpen: true, id });
    };

    const handleConfirmDelete = () => {
        if (!deleteModal.id) return;
        execute(async () => {
            try {
                const res = await ALLAUTH_API.deleteWebAuthnCredential([deleteModal.id!]);
                if (res.status === 200) {
                    await queryClient.invalidateQueries({ queryKey: ['authenticators'] });
                    await router.invalidate();
                    // onUpdate(); // Redundant if we are already invalidating router
                    setDeleteModal({ isOpen: false, id: null });
                } else {
                    setError(res.errors?.[0]?.message || 'Failed to delete key.');
                }
            } catch (e: any) {
                setError(e.message);
            }
        });
    };

    const handleEditStart = (auth: Authenticator) => {
        setEditingId(auth.id);
        // Types don't include name on Authenticator base interface, but API returns it for WebAuthn
        setEditName((auth as any).name || 'Security Key');
    };

    const handleEditSave = async (id: string) => {
        execute(async () => {
            try {
                const res = await ALLAUTH_API.updateWebAuthnCredential(id, { name: editName });
                if (res.status === 200) {
                    setEditingId(null);
                    await queryClient.invalidateQueries({ queryKey: ['authenticators'] });
                    await router.invalidate();
                    onUpdate();
                } else if (res.status === 401 || res.status === 403) {
                    // If we get here, it means local check passed but server rejected.
                    // Ideally we would trigger reauth again, but for now just showing specific error
                    setError('Reauthentication required. Please refresh the page and try again.');
                } else {
                    setError(res.errors?.[0]?.message || 'Failed to update key.');
                }
            } catch (e: any) {
                setError(e.message);
            }
        });
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6 transition-colors">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <Key size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Security Keys & Passkeys</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your WebAuthn security keys.</p>
                    </div>
                </div>
                {!adding && (
                    <button
                        onClick={() => setAdding(true)}
                        className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold rounded-lg hover:bg-black dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        <Plus size={16} /> Add Key
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-4 border-b border-red-100 dark:border-red-800">
                    {error}
                </div>
            )}

            {adding && (
                <div className="p-6 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Add New Security Key</h3>
                    <div className="space-y-4 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Key Name</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. My MacBook"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="passwordless"
                                checked={isPasswordless}
                                onChange={(e) => setIsPasswordless(e.target.checked)}
                                className="rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                            <label htmlFor="passwordless" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                This is a Passkey (supports passwordless login)
                            </label>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleAdd}
                                disabled={!newName || loading}
                                className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                Continue
                            </button>
                            <button
                                onClick={() => { setAdding(false); setLoading(false); setError(null); }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {webauthnAuths.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400 italic">
                        No security keys added yet.
                    </div>
                ) : (
                    webauthnAuths.map((auth: any) => (
                        <div key={auth.id} className="p-4 sm:p-6 flex items-center justify-between group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
                                    <Key size={20} />
                                </div>
                                <div>
                                    {editingId === auth.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                            <button onClick={() => handleEditSave(auth.id)} className="text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 p-1 rounded">
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <h3 className="font-semibold text-gray-900 dark:text-white">{auth.name || 'Unnamed Key'}</h3>
                                    )}
                                    <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        <span>Added: {new Date(auth.created_at * 1000).toLocaleDateString()}</span>
                                        <span>•</span>
                                        <span>{auth.is_passwordless ? 'Passkey' : 'Security Key'}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleEditStart(auth)}
                                    className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                                    title="Edit name"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button
                                    onClick={() => handleDeleteClick(auth.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Remove key"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, id: null })}
                onConfirm={handleConfirmDelete}
                title="Remove Security Key?"
                message="Are you sure you want to remove this security key? You will no longer be able to use it to sign in."
                confirmText="Yes, Remove"
                isLoading={loading}
                type="danger"
            />
        </div>
    );
};
