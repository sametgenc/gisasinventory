import axios from 'axios';

const api = axios.create({
    baseURL: 'https://gisasassets.co',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    validateStatus: (status: number) => {
        return (status >= 200 && status < 300) || [400, 401, 403, 404, 409, 410, 429].includes(status);
    },
});

// CSRF Handling for Django
api.interceptors.request.use((config: any) => {
    const csrfToken = document.cookie
        .split('; ')
        .find((row) => row.startsWith('csrftoken='))
        ?.split('=')[1];

    if (csrfToken) {
        config.headers['X-CSRFToken'] = csrfToken;
    }
    return config;
});

// Auth Change Event Handling
api.interceptors.response.use((response: any) => {
    const msg = response.data;
    if ([401, 410].includes(msg.status) || (msg.status === 200 && msg.meta?.is_authenticated !== undefined)) {
        const event = new CustomEvent('allauth.auth.change', { detail: msg });
        document.dispatchEvent(event);
    }
    return response;
}, (error: any) => {
    if (error.response) {
        const msg = error.response.data;
        if ([401, 410].includes(msg.status)) {
            const event = new CustomEvent('allauth.auth.change', { detail: msg });
            document.dispatchEvent(event);
        }
    }
    return Promise.reject(error);
});

export default api;
