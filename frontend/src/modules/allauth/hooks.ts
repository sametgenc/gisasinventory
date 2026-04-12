import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALLAUTH_API } from './data';
import { ALLAUTH_KEYS } from './keys';
import type { LoginData, SignupData } from './types';

export const useAllauthSession = () => {
    return useQuery({
        queryKey: ALLAUTH_KEYS.session(),
        queryFn: ALLAUTH_API.getSession,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};

export const useAllauthConfig = () => {
    return useQuery({
        queryKey: ALLAUTH_KEYS.config(),
        queryFn: ALLAUTH_API.getConfig,
        staleTime: 1000 * 60 * 60, // 1 hour
    });
};

export const useLoginMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: LoginData) => ALLAUTH_API.login(data),
        onSuccess: (res) => {
            if (res.status === 200) {
                queryClient.invalidateQueries({ queryKey: ALLAUTH_KEYS.session() });
            }
        },
    });
};

export const useSignupMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: SignupData) => ALLAUTH_API.signup(data),
        onSuccess: (res) => {
            if (res.status === 200) {
                queryClient.invalidateQueries({ queryKey: ALLAUTH_KEYS.session() });
            }
        },
    });
};

export const useLogoutMutation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ALLAUTH_API.logout,
        onSuccess: () => {
            queryClient.setQueryData(ALLAUTH_KEYS.session(), { status: 401, data: {} });
            queryClient.invalidateQueries({ queryKey: ALLAUTH_KEYS.all });
        },
    });
};

export const useMFAAuthenticators = () => {
    return useQuery({
        queryKey: ALLAUTH_KEYS.authenticators(),
        queryFn: ALLAUTH_API.getAuthenticators,
    });
};
