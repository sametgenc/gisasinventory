import type { AxiosError } from 'axios';

type ErrorBody = Record<string, unknown> & {
    detail?: unknown;
    non_field_errors?: unknown;
};

function stringifyDetail(detail: unknown): string {
    if (detail == null) return '';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(String).filter(Boolean).join('; ');
    if (typeof detail === 'object') {
        try {
            return JSON.stringify(detail);
        } catch {
            return String(detail);
        }
    }
    return String(detail);
}

/**
 * Extracts a human-readable message from an axios/DRF error response.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Request failed'): string {
    if (!err || typeof err !== 'object') return fallback;
    const ax = err as AxiosError<ErrorBody>;
    const data = ax.response?.data;
    if (!data || typeof data !== 'object') {
        return typeof ax.message === 'string' && ax.message ? ax.message : fallback;
    }
    const fromDetail = stringifyDetail(data.detail);
    if (fromDetail) return fromDetail;
    const nfe = data.non_field_errors;
    if (Array.isArray(nfe) && nfe.length) return nfe.map(String).join('; ');
    const parts: string[] = [];
    for (const [key, value] of Object.entries(data)) {
        if (key === 'detail' || key === 'non_field_errors') continue;
        if (Array.isArray(value)) parts.push(`${key}: ${value.join(', ')}`);
        else if (value != null && value !== '') parts.push(`${key}: ${String(value)}`);
    }
    if (parts.length) return parts.join('; ');
    return fallback;
}
