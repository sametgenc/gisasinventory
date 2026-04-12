import { createFileRoute } from '@tanstack/react-router';
import { MFAAuthenticate } from '@/modules/allauth/mfa/MFAAuthenticate';

export const Route = createFileRoute('/_auth/auth/mfa/authenticate')({
    validateSearch: (search: Record<string, unknown>) => {
        return {
            redirect: (search.redirect as string) || undefined,
        }
    },
    component: MFAAuthenticate,
});
