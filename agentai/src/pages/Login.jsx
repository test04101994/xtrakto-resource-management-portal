import { useState, useEffect } from 'react';
import { useAuth, loginWithApi, getRoles } from '../context/AuthContext';
import { LogIn, Shield, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);

  useEffect(() => {
    getRoles()
      .then(roles => setAvailableRoles(roles.map(r => r.role).sort()))
      .catch(() => setAvailableRoles(['Admin', 'Manager', 'Viewer']));
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await loginWithApi(selectedRole, password);
      login(user);
    } catch (err) {
      setError(err.message || 'Invalid role or password. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img src="/data/exl-logo.svg" alt="EXL" />
          </div>
          <h1>Xtrakto.ai</h1>
          <p>Resource Management Portal</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && (
            <div className="login-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <label>
            <span className="login-label">Role</span>
            <div className="login-input-wrapper">
              <Shield size={16} className="login-input-icon" />
              <select
                required
                value={selectedRole}
                onChange={e => { setSelectedRole(e.target.value); setError(''); }}
              >
                <option value="">Select your role...</option>
                {availableRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
          </label>

          <label>
            <span className="login-label">Password</span>
            <div className="login-input-wrapper">
              <Lock size={16} className="login-input-icon" />
              <input
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
              />
            </div>
          </label>

          <button type="submit" className="btn btn-primary btn-login" disabled={loading || !selectedRole}>
            {loading ? (
              <span>Signing in...</span>
            ) : (
              <><LogIn size={16} /> Sign In</>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p>Contact your administrator for access credentials</p>
        </div>
      </div>
    </div>
  );
}
