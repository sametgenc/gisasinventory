import { useCallback } from 'react';
import { useAuth } from '@/auth/context';
import { useNavigate, useLocation } from '@tanstack/react-router';
import type { AuthResponse } from '../types';

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

    const handleResponse = useCallback(async (response: AuthResponse): Promise<boolean> => {
        const flows = response.data?.flows ?? response.meta?.flows ?? [];
        if (response.status === 401 && flows.some(flow => flow.id === 'reauthenticate' || flow.id === 'mfa_reauthenticate')) {
            await navigate({
                to: '/auth/reauthenticate',
                search: { next: location.pathname },
            });
            return false;
        }
        return true;
    }, [navigate, location.pathname]);

    return { execute, handleResponse };
};
