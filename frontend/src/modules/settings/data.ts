import api from '@/api/client';

export interface SmtpSettingsData {
    host: string;
    port: number;
    username: string;
    password_set: boolean;
    use_tls: boolean;
    use_ssl: boolean;
    from_email: string;
    is_configured: boolean;
    updated_at: string | null;
}

export interface SmtpSettingsInput {
    host: string;
    port: number;
    username: string;
    password: string;
    use_tls: boolean;
    use_ssl: boolean;
    from_email: string;
}

export interface SmtpStatus {
    is_configured: boolean;
}

export const settingsApi = {
    getSmtpSettings: async (): Promise<SmtpSettingsData> => {
        const response = await api.get('/api/settings/smtp/');
        return response.data;
    },

    updateSmtpSettings: async (data: SmtpSettingsInput): Promise<SmtpSettingsData> => {
        const response = await api.put('/api/settings/smtp/', data);
        return response.data;
    },

    testSmtpConnection: async (email: string): Promise<{ detail: string }> => {
        const response = await api.post('/api/settings/smtp/test/', { email });
        return response.data;
    },

    getSmtpStatus: async (): Promise<SmtpStatus> => {
        const response = await api.get('/api/settings/smtp/status/');
        return response.data;
    },
};
