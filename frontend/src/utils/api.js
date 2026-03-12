import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5050/api',
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
});

// Request interceptor — add JWT token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor — handle auth errors
api.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401 || error.response?.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;
