import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        }
        setLoading(false);
    };

    const demoLogin = (demoEmail) => {
        setEmail(demoEmail);
        setPassword('password123');
    };

    return (
        <div className="login-page">
            <div className="login-card slide-in">
                <div className="login-logo">
                    <div className="login-logo-icon"></div>
                    <h1>Planora</h1>
                    <p>Smart College Timetable System</p>
                </div>

                {error && <div className="login-error">⚠ {error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                        {loading ? 'Signing in...' : '→ Sign In'}
                    </button>
                </form>

                <div className="login-demo">
                    <div className="login-demo-title">Quick Demo Access</div>
                    <div className="demo-credentials">
                        <div className="demo-cred" onClick={() => demoLogin('admin@college.edu')}>
                            <span className="demo-cred-role"> Admin</span>
                            <span className="demo-cred-email">admin@college.edu</span>
                        </div>
                        <div className="demo-cred" onClick={() => demoLogin('sharma@college.edu')}>
                            <span className="demo-cred-role">Faculty</span>
                            <span className="demo-cred-email">sharma@college.edu</span>
                        </div>
                        {/* <div className="demo-cred" onClick={() => demoLogin('rahul@college.edu')}>
                            <span className="demo-cred-role">🎓 Student</span>
                            <span className="demo-cred-email">rahul@college.edu</span>
                        </div> */}
                    </div>
                </div>
            </div>
        </div>
    );
}
