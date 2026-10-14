import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// CSRF Handling for Django
api.interceptors.request.use((config) => {
    // Only Allauth encodes pending authentication flows in 4xx responses.
    // Normal REST errors must reject mutations so forms keep their error state.
    if (config.url?.startsWith('/_allauth/')) {
        config.validateStatus = (status) => (status >= 200 && status < 300) ||
            [400, 401, 403, 404, 409, 410, 429].includes(status);
    }
    // FormData must use multipart boundary set by the browser. The default
    // `Content-Type: application/json` from the axios instance would break
    // Django's MultiPartParser (empty FILES → preview/import fails or total_rows: 0).
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        config.headers.delete('Content-Type');
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
api.interceptors.response.use((response) => {
    const msg = response.data;
    if ([401, 410].includes(msg.status) || (msg.status === 200 && msg.meta?.is_authenticated !== undefined)) {
        const event = new CustomEvent('allauth.auth.change', { detail: msg });
        document.dispatchEvent(event);
    }
    return response;
}, (error: unknown) => {
    if (axios.isAxiosError(error) && error.response) {
        const msg = error.response.data;
        if ([401, 410].includes(msg.status)) {
            const event = new CustomEvent('allauth.auth.change', { detail: msg });
            document.dispatchEvent(event);
        }
    }
    return Promise.reject(error);
});

export default api;
