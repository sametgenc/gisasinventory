import React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      if (user) {
        navigate({ to: "/dashboard" });
      } else if (pendingFlow) {
        // Check path for pending flow (like provider_signup or mfa_authenticate)
        const target = pathForPendingFlow({ status: 401, data: { flows: [pendingFlow] } }) || "/login";
        navigate({ to: target });
      } else {
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
          {t("login.loginFailed")}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
          {error === "access_denied"
            ? t("account.providers.denied")
            : t("account.providers.loginFailed")}
        </p>
        <Link
          to="/login"
          search={{ redirect: undefined }}
          className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
        >
          {t("passwordRequest.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
