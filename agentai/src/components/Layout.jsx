import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Sun, Moon, LayoutDashboard, Users, Hash, GitBranch, PanelLeftOpen, ChevronLeft, ChevronRight, UserCheck, BarChart3, FileSpreadsheet, Settings, Send } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/cost-codes', label: 'Cost Codes', icon: Hash },
  { to: '/allocations', label: 'Allocations', icon: GitBranch },
  { to: '/consolidated-allocations', label: 'Consolidated View', icon: BarChart3 },
  { to: '/available-resources', label: 'Available Resources', icon: UserCheck },
  { to: '/submission-history', label: 'Submission History', icon: Send, adminOnly: true },
  { to: '/bulk-upload', label: 'Bulk Upload', icon: FileSpreadsheet, adminOnly: true },
  { to: '/manage-dropdowns', label: 'Configuration', icon: Settings, adminOnly: true },
];

const MIN_WIDTH = 0;
const DEFAULT_WIDTH = 300;
const MAX_WIDTH = 400;
const SNAP_THRESHOLD = 60;

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    if (saved !== null && saved !== undefined) {
      const num = Number(saved);
      if (num >= 0 && num <= MAX_WIDTH) return num;
    }
    return DEFAULT_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef(null);
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const isHidden = sidebarWidth <= SNAP_THRESHOLD;

  // Save width to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e) {
      let newWidth = e.clientX;
      // Snap to hidden if dragged below threshold
      if (newWidth < SNAP_THRESHOLD) {
        newWidth = 0;
      } else if (newWidth < 140) {
        // Snap to minimum usable width
        newWidth = 140;
      } else if (newWidth > MAX_WIDTH) {
        newWidth = MAX_WIDTH;
      }
      setSidebarWidth(newWidth);
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function showSidebar() {
    setSidebarWidth(DEFAULT_WIDTH);
  }

  function toggleSidebar() {
    if (isHidden) {
      setSidebarWidth(DEFAULT_WIDTH);
    } else {
      setSidebarWidth(0);
    }
  }

  return (
    <div className="app-layout">
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Collapsed sidebar strip */}
      {isHidden && (
        <aside className="sidebar-collapsed">
          <button className="sidebar-toggle-btn" onClick={showSidebar} title="Expand sidebar">
            <ChevronRight size={16} />
          </button>
        </aside>
      )}

      <aside
        ref={sidebarRef}
        className={`sidebar ${sidebarOpen ? 'open' : ''} ${isHidden ? 'hidden-sidebar' : ''}`}
        style={{ width: isHidden ? 0 : sidebarWidth }}
      >
        <div className="sidebar-header">
          <img src="/data/exl-logo.svg" alt="EXL" className="sidebar-logo" />
          <div className="sidebar-brand">
            <h1>Xtrakto.ai</h1>
            <span className="sidebar-subtitle">Resource Management Portal</span>
          </div>
          <button className="sidebar-toggle-btn" onClick={toggleSidebar} title="Collapse sidebar">
            <ChevronLeft size={18} />
          </button>
        </div>
        <nav>
          {navItems.filter(item => !item.adminOnly || isAdmin).map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
                end={item.to === '/'}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          {user && (
            <div className="sidebar-user">
              <div className="user-info">
                <div className="user-name">{user.displayName}</div>
                <div className="user-role">
                  <span className={`badge badge-sm ${isAdmin ? 'badge-danger' : 'badge-info'}`}>{user.role}</span>
                </div>
              </div>
              <button className="btn-icon" onClick={handleLogout} title="Sign out">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Drag handle on the right edge */}
        <div
          className={`sidebar-resize-handle ${isDragging ? 'active' : ''}`}
          onMouseDown={handleMouseDown}
        />
      </aside>

      <main
        className="main-content"
        style={{ marginLeft: isHidden ? 40 : sidebarWidth }}
      >
        <Outlet />
      </main>
    </div>
  );
}
