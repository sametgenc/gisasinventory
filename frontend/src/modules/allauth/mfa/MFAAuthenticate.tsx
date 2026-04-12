import React, { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { pathForPendingFlow } from "../routing";
import { ALLAUTH_API } from "../data";
import { useAuth } from "../../../auth/context";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  Fingerprint,
  Smartphone,
  Key,
} from "lucide-react";
import {
  parseRequestOptionsFromJSON,
  get as webauthnGet,
} from "@github/webauthn-json/browser-ponyfill";

type AuthMethod = "totp" | "passkey" | "recovery";

export const MFAAuthenticate: React.FC = () => {
  const [method, setMethod] = useState<AuthMethod>("totp");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  // Separate error states for each method
  const [totpError, setTotpError] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refresh, pendingFlow, logout } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/_auth/auth/mfa/authenticate" });

  // Check available MFA types from pending flow
  const mfaFlow = pendingFlow?.id === "mfa_authenticate" ? pendingFlow : null;
  const availableTypes = mfaFlow?.types || [
    "totp",
    "webauthn",
    "recovery_codes",
  ];
  const hasTotp = availableTypes.includes("totp");
  const hasWebauthn = availableTypes.includes("webauthn");
  const hasRecovery = availableTypes.includes("recovery_codes");

  const handleCancelMFA = async () => {
    // Log out the user and redirect to login
    await logout();
    navigate({ to: "/login", search: { redirect: "/dashboard" } });
  };

  const handleSuccessRedirect = async () => {
    await refresh();
    const target =
      search.redirect && search.redirect !== "/login"
        ? search.redirect
        : "/dashboard";
    navigate({ to: target });
  };

  const handleTOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTotpError(null);

    try {
      const res = await ALLAUTH_API.authenticateMFA(code);
      if (res.status === 200) {
        const nextStep = pathForPendingFlow(res);
        if (nextStep) {
          navigate({ to: nextStep });
        } else {
          await handleSuccessRedirect();
        }
      } else {
        setTotpError(res.errors?.[0]?.message || "Invalid code");
      }
    } catch (err: any) {
      setTotpError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySubmit = async () => {
    setLoading(true);
    setPasskeyError(null);

    try {
      const optResp =
        await ALLAUTH_API.getWebAuthnRequestOptionsForAuthentication();
      if (!optResp.data?.request_options) {
        throw new Error("Could not get passkey options");
      }
      const jsonOptions = optResp.data.request_options;
      const options = parseRequestOptionsFromJSON(jsonOptions);
      const credential = await webauthnGet(options);
      const res = await ALLAUTH_API.authenticateWebAuthn(credential);

      if (res.status === 200) {
        const nextStep = pathForPendingFlow(res);
        if (nextStep) {
          navigate({ to: nextStep });
        } else {
          await handleSuccessRedirect();
        }
      } else {
        setPasskeyError(res.errors?.[0]?.message || "Authentication failed");
      }
    } catch (err: any) {
      setPasskeyError(
        err.message || "An error occurred during passkey verification",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRecoveryError(null);

    try {
      const res = await ALLAUTH_API.authenticateMFA(recoveryCode);
      if (res.status === 200) {
        const nextStep = pathForPendingFlow(res);
        if (nextStep) {
          navigate({ to: nextStep });
        } else {
          await handleSuccessRedirect();
        }
      } else {
        setRecoveryError(res.errors?.[0]?.message || "Invalid recovery code");
      }
    } catch (err: any) {
      setRecoveryError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Count available methods
  const methodCount = [hasTotp, hasWebauthn, hasRecovery].filter(
    Boolean,
  ).length;

  // If no methods are available, show a message
  if (methodCount === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto relative">
          <div className="relative p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                MFA Not Configured
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">
                Two-factor authentication is required but you haven't set up any
                authentication methods yet.
              </p>
            </div>
            <button
              onClick={() => navigate({ to: "/account/authenticators" })}
              className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
            >
              Set Up MFA
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      {/* Background Effect */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.8),_transparent)] dark:bg-[radial-gradient(circle_at_50%_50%,_rgba(30,30,40,0.5),_transparent)] pointer-events-none" />

      <div className="w-full max-w-md mx-auto relative group">
        <div className="relative p-8 bg-white dark:bg-gray-900 rounded-3xl shadow-xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-800 transition-colors">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Two-Factor Authentication
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Verify your identity to continue signing in.
            </p>
          </div>

          {/* Method Toggle - only show if multiple methods available */}
          {methodCount > 1 && (
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6 gap-1">
              {hasTotp && (
                <button
                  type="button"
                  onClick={() => setMethod("totp")}
                  className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${method === "totp"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                >
                  <Smartphone size={14} />
                  TOTP
                </button>
              )}
              {hasWebauthn && (
                <button
                  type="button"
                  onClick={() => setMethod("passkey")}
                  className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${method === "passkey"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                >
                  <Fingerprint size={14} />
                  Passkey
                </button>
              )}
              {hasRecovery && (
                <button
                  type="button"
                  onClick={() => setMethod("recovery")}
                  className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${method === "recovery"
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                >
                  <Key size={14} />
                  Recovery
                </button>
              )}
            </div>
          )}

          {/* Fixed height content area to prevent card size changes */}
          <div className="min-h-[280px] flex flex-col">
            {method === "totp" && (
              <form
                onSubmit={handleTOTPSubmit}
                className="flex flex-col flex-1"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Authenticator Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    autoFocus
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-2xl tracking-widest placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    autoComplete="one-time-code"
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                {totpError && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm">
                    <AlertCircle size={18} />
                    {totpError}
                  </div>
                )}

                <div className="mt-auto pt-5">
                  <button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      "Verify Code"
                    )}
                  </button>
                </div>
              </form>
            )}

            {method === "passkey" && (
              <div className="flex flex-col flex-1">
                <div className="text-center p-6 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <Fingerprint
                    className="mx-auto mb-3 text-indigo-600 dark:text-indigo-400"
                    size={48}
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Click the button below to verify using your passkey or
                    security key.
                  </p>
                </div>

                {passkeyError && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm">
                    <AlertCircle size={18} />
                    {passkeyError}
                  </div>
                )}

                <div className="mt-auto pt-5">
                  <button
                    type="button"
                    onClick={handlePasskeySubmit}
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <>
                        <Fingerprint size={20} />
                        Use Passkey
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {method === "recovery" && (
              <form
                onSubmit={handleRecoverySubmit}
                className="flex flex-col flex-1"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Recovery Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center font-mono tracking-wider placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    placeholder="xxxx-xxxx-xxxx"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                    Enter one of your recovery codes
                  </p>
                </div>

                {recoveryError && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm">
                    <AlertCircle size={18} />
                    {recoveryError}
                  </div>
                )}

                <div className="mt-auto pt-5">
                  <button
                    type="submit"
                    disabled={loading || !recoveryCode.trim()}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-95"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      "Use Recovery Code"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Cancel/Logout option */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleCancelMFA}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Cancel and return to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
