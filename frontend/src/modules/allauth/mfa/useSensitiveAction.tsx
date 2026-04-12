import { useCallback } from 'react';
import { useAuth } from '@/auth/context';
import { useNavigate, useLocation } from '@tanstack/react-router';

export const useSensitiveAction = () => {
    const { needsReauthentication } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const execute = useCallback((action: () => void) => {
        if (needsReauthentication()) {
            navigate({
                to: '/auth/reauthenticate',
                search: { next: location.pathname }
            });
        } else {
            action();
        }
    }, [needsReauthentication, navigate, location.pathname]);

    return { execute };
};
