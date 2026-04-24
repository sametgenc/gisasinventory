import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
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
    // FormData must use multipart boundary set by the browser. The default
    // `Content-Type: application/json` from the axios instance would break
    // Django's MultiPartParser (empty FILES → preview/import fails or total_rows: 0).
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        const h = config.headers;
        if (h?.delete) {
            h.delete('Content-Type');
        } else {
            delete h?.['Content-Type'];
            delete h?.['content-type'];
        }
    }

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
