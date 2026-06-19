import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import sriEshwarLogo from '../assets/sri_eshwar_logo.png';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username || !password) {
            setError('Please enter both username and password.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await login(username, password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid credentials or connection error');
        } finally {
            setLoading(false);
        }
    };

    const handleFillDemo = (user, pass) => {
        setUsername(user);
        setPassword(pass);
    };

    return (
        <div className="login-page">
            <div className="login-card fade-in">
                <div className="login-logo">
                    <img src={sriEshwarLogo} alt="Sri Eshwar Logo" style={{
                        height: '64px',
                        display: 'block',
                        margin: '0 auto 12px auto',
                        objectFit: 'contain'
                    }} />
                    <h1>Sri Eshwar</h1>
                    <p style={{ textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px', fontWeight: '700', color: 'var(--primary)', margin: '2px 0 6px 0' }}>
                        College of Engineering
                    </p>
                    <p>Timetable Scheduling System</p>
                </div>

                {error && (
                    <div className="login-error">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '18px' }}>
                        <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                            className="form-input"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="form-input"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary login-btn"
                        style={{ height: '42px', fontSize: '14px', fontWeight: '600' }}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                {/* <div className="login-demo">
                    <div className="login-demo-title">Demo Accounts</div>
                    <div className="demo-credentials">
                        <div className="demo-cred" onClick={() => handleFillDemo('admin', 'admin123')}>
                            <span className="demo-cred-role">Administrator</span>
                            <span className="demo-cred-email">admin / admin123</span>
                        </div>
                        <div className="demo-cred" onClick={() => handleFillDemo('cse_admin', 'dept123')}>
                            <span className="demo-cred-role">CSE Department</span>
                            <span className="demo-cred-email">cse_admin / dept123</span>
                        </div>
                    </div>
                </div> */}
            </div>
        </div>
    );
}
