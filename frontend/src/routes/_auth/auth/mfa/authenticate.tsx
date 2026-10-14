import { createFileRoute } from '@tanstack/react-router';
import { MFAAuthenticate } from '@/modules/allauth/mfa/MFAAuthenticate';
import { safeReturnPath } from '@/modules/allauth/mfa/security';

export const Route = createFileRoute('/_auth/auth/mfa/authenticate')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            redirect: safeReturnPath(search.redirect),
        }
    },
    component: MFAAuthenticate,
});
