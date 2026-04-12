import React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/auth/context";
import { pathForPendingFlow } from "@/modules/allauth/routing";
// Imports removed
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_auth/account/provider/callback")({
  component: ProviderCallback,
  validateSearch: (search: Record<string, unknown>) => ({
    error: search.error as string | undefined,
  }),
});

function ProviderCallback() {
  const { error } = Route.useSearch();
  const { user, pendingFlow, refresh, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!error) {
      refresh(true);
    }
  }, [error, refresh]);

  React.useEffect(() => {
    if (!error && !loading) {
      console.log("[ProviderCallback] State:", { user, pendingFlow, loading });
      if (user) {
        console.log(
          "[ProviderCallback] User authenticated, redirecting to dashboard",
        );
        navigate({ to: "/dashboard" });
      } else if (pendingFlow) {
        console.log("[Auth] ProviderCallback pending flow:", pendingFlow.id);
        // Check path for pending flow (like provider_signup or mfa_authenticate)
        const target = pathForPendingFlow({ data: { flows: [pendingFlow] } } as any) || "/login";
        console.log("[ProviderCallback] Redirecting to:", target);
        navigate({ to: target });
      } else {
        console.log(
          "[ProviderCallback] No user and no pending flow, redirecting to login",
        );
        navigate({ to: "/login", search: { redirect: "/dashboard" } });
      }
    }
  }, [error, user, pendingFlow, loading, navigate]);

  if (!error) {
    return null; // Redirecting...
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gray-50/50 dark:bg-gray-950 transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-3xl flex items-center justify-center mb-6 mx-auto">
          <AlertCircle size={40} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Login Failed
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
          {error === "access_denied"
            ? "Access was denied by the third-party provider."
            : "Something went wrong during the login process."}
        </p>
        <Link
          to="/login"
          search={{ redirect: undefined }}
          className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
