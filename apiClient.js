import { getToken, getUserPayload } from './auth.js';

export const callAPI = async (endpoint, { body, method = 'GET', params } = {}) => {
    const token = await getToken();
    const headers = { 'Content-Type': 'application/json' };

    if (token) {
        const payload = getUserPayload();
        headers['Authorization'] = `Bearer ${token}`;
        if (payload && payload.sub) headers['X-User-Id'] = payload.sub;
    }

    let url = `/.netlify/functions/${endpoint}`;
    if (params) {
        const queryString = new URLSearchParams(params).toString();
        url += `?${queryString}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Błąd serwera (${response.status}): ${errorText}`);
    }

    if (response.status === 204) return null;

    try {
        const text = await response.text();
        if (!text) return null;
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
};
