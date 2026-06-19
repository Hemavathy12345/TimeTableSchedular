import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const cached = localStorage.getItem('user');
        try {
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initializeAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const res = await api.get('/auth/me');
                    setUser(res.data);
                    localStorage.setItem('user', JSON.stringify(res.data));
                } catch (err) {
                    console.error('Session validation failed:', err);
                    logout();
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        };
        initializeAuth();
    }, []);

    const login = async (username, password) => {
        setLoading(true);
        try {
            const res = await api.post('/auth/login', { username, password });
            const { token, user: loggedUser } = res.data;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(loggedUser));
            setUser(loggedUser);
            return loggedUser;
        } catch (err) {
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
