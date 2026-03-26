import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState({ id: 'admin-001', name: 'Admin', role: 'admin' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // No longer needed
    }, []);


    const login = async () => {};
    const logout = () => {};

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
