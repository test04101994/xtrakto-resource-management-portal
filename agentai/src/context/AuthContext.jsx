import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext();

const AUTH_STORAGE_KEY = 'allocDashAuth';
const AUTH_TIMESTAMP_KEY = 'allocDashAuthTime';
const AUTH_TIMEOUT_KEY = 'allocDashTimeout';
const DEFAULT_TIMEOUT_MINUTES = 15;

function getTimeoutMs() {
  const stored = localStorage.getItem(AUTH_TIMEOUT_KEY);
  const minutes = stored ? parseInt(stored, 10) : DEFAULT_TIMEOUT_MINUTES;
  if (minutes === 0) return 0; // 0 means no auto-logout
  return minutes * 60 * 1000;
}

export const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  VIEWER: 'Viewer',
};

function loadAuth() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const timeoutMs = getTimeoutMs();
      if (timeoutMs > 0) {
        const lastActivity = localStorage.getItem(AUTH_TIMESTAMP_KEY);
        if (lastActivity && Date.now() - parseInt(lastActivity, 10) > timeoutMs) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem(AUTH_TIMESTAMP_KEY);
          return null;
        }
      }
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load auth:', e);
  }
  return null;
}

/**
 * Login via API — validates role + password against DynamoDB credentials table.
 * Returns { role, displayName } on success, throws on failure.
 */
export async function loginWithApi(role, password) {
  return authApi.login(role, password);
}

/**
 * Get available roles from API.
 */
export async function getRoles() {
  return authApi.getRoles();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadAuth);
  const timerRef = useRef(null);

  const performLogout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_TIMESTAMP_KEY);
    window.location.reload();
  }, []);

  const resetTimer = useCallback(() => {
    if (!user) return;
    const timeoutMs = getTimeoutMs();
    if (timeoutMs === 0) return; // no auto-logout
    localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performLogout, timeoutMs);
  }, [user, performLogout]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());

      const timeoutMs = getTimeoutMs();
      if (timeoutMs > 0) {
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetTimer));
        timerRef.current = setTimeout(performLogout, timeoutMs);

        return () => {
          events.forEach(e => window.removeEventListener(e, resetTimer));
          if (timerRef.current) clearTimeout(timerRef.current);
        };
      }
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_TIMESTAMP_KEY);
    }
  }, [user, resetTimer, performLogout]);

  function login(userData) {
    setUser(userData);
  }

  function logout() {
    performLogout();
  }

  const isAdmin = user?.role === ROLES.ADMIN;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
