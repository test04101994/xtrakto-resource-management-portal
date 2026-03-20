import { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { validateAllocationPercentage, getEmployeeTotalAllocation } from '../utils/validationUtils';
import { exportFilteredAllocations } from '../utils/excelUtils';
import { Plus, Edit2, Trash2, AlertTriangle, Lock, Download, Calendar, Settings, MessageSquare, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import ExcelUpload from '../components/ExcelUpload';
import SearchableSelect from '../components/SearchableSelect';
import { v4 as uuidv4 } from 'uuid';
import { formatDate } from '../utils/dateUtils';

const ALLOCATION_TYPES = ['Forecasted', 'Approved', 'Cancelled'];
const emptyAlloc = { employeeId: '', costCodeId: '', percentage: '', startDate: '', endDate: '', allocationType: 'Forecasted', comment: '' };

function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export default function Allocations() {
  const { state, dispatch } = useAppContext();
  const { user, isAdmin } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyAlloc);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultEndStr = (() => { const d = new Date(todayStr + 'T00:00:00'); d.setDate(d.getDate() + 29); return d.toISOString().slice(0, 10); })();
  const [filterStartDate, setFilterStartDate] = useState(todayStr);
  const [filterEndDate, setFilterEndDate] = useState(defaultEndStr);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterCostCode, setFilterCostCode] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterPod, setFilterPod] = useState('');
  const [showWindowModal, setShowWindowModal] = useState(false);
  const [windowForm, setWindowForm] = useState({ startDate: '', endDate: '', enabled: false });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [highlightId, setHighlightId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Clear highlight after flash animation completes
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), 3500);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const allocationWindow = state.allocationWindow || { startDate: '', endDate: '', enabled: false };
  const isManager = user?.role === 'Manager';
  const windowActive = allocationWindow.enabled && allocationWindow.startDate && allocationWindow.endDate;
  const today = new Date().toISOString().slice(0, 10);
  const windowOpen = windowActive && today >= allocationWindow.startDate && today <= allocationWindow.endDate;
  const canAdd = isAdmin || !windowActive || windowOpen;

  const empMap = useMemo(() => Object.fromEntries(state.employees.map(e => [e.id, e])), [state.employees]);
  const ccMap = useMemo(() => Object.fromEntries(state.costCodes.map(c => [c.id, c])), [state.costCodes]);
  const benchCostCodeId = state.lookups?.['bench-cost-code']?.[0] || null;
  const benchCostCodeCode = benchCostCodeId && ccMap[benchCostCodeId] ? ccMap[benchCostCodeId].code : null;
  const classifications = useMemo(() => [...new Set(state.employees.map(e => e.classification).filter(Boolean))].sort(), [state.employees]);
  const pods = useMemo(() => [...new Set(state.employees.map(e => e.pod).filter(Boolean))].sort(), [state.employees]);

  const filteredAllocations = useMemo(() => {
    let result = state.allocations;
    if (filterStartDate && filterEndDate) {
      result = result.filter(a => a.startDate <= filterEndDate && a.endDate >= filterStartDate);
    } else if (filterStartDate) {
      result = result.filter(a => a.endDate >= filterStartDate);
    } else if (filterEndDate) {
      result = result.filter(a => a.startDate <= filterEndDate);
    }
    if (filterEmployee) {
      const q = filterEmployee.toLowerCase();
      result = result.filter(a => (empMap[a.employeeId]?.name || '').toLowerCase().includes(q));
    }
    if (filterCostCode) {
      result = result.filter(a => a.costCodeId === filterCostCode);
    }
    if (filterType) {
      result = result.filter(a => (a.allocationType || 'Forecasted') === filterType);
    }
    if (filterClassification) result = result.filter(a => empMap[a.employeeId]?.classification === filterClassification);
    if (filterPod) result = result.filter(a => empMap[a.employeeId]?.pod === filterPod);
    return result;
  }, [state.allocations, filterStartDate, filterEndDate, filterEmployee, filterCostCode, filterType, filterClassification, filterPod, ccMap, empMap]);

  const allocSchema = state.schemas?.allocations?.fields || [];

  // Render map for all known column keys
  const columnRenderers = useMemo(() => ({
    employeeName: {
      label: 'Employee',
      render: (row) => empMap[row.employeeId]?.name || 'Unknown',
    },
    employeeId: {
      label: 'Employee ID',
      render: (row) => <span className="text-muted">{row.employeeId}</span>,
    },
    costCodeCode: {
      label: 'Cost Code',
      render: (row) => {
        const cc = ccMap[row.costCodeId];
        return cc ? cc.code : 'Unknown';
      },
    },
    costCodeName: {
      label: 'Project Name',
      render: (row) => {
        const cc = ccMap[row.costCodeId];
        return cc ? cc.name : '-';
      },
    },
    costCodeCategory: {
      label: 'Category',
      render: (row) => {
        const cc = ccMap[row.costCodeId];
        return cc?.category ? <span className="badge badge-neutral">{cc.category}</span> : '-';
      },
    },
    sgu: {
      label: 'SGU',
      render: (row) => ccMap[row.costCodeId]?.sgu || <span className="text-muted">-</span>,
    },
    imu: {
      label: 'IMU',
      render: (row) => ccMap[row.costCodeId]?.imu || <span className="text-muted">-</span>,
    },
    percentage: {
      label: 'Allocation %',
      render: (row) => {
        const type = row.allocationType || 'Forecasted';
        const cls = type === 'Approved' ? 'badge-success' : type === 'Cancelled' ? 'badge-danger' : 'badge-warning';
        return <span className={`badge ${cls}`}>{row.percentage}%</span>;
      },
    },
    startDate: { label: 'Start Date', render: (row) => formatDate(row.startDate) },
    endDate: { label: 'End Date', render: (row) => formatDate(row.endDate) },
    allocationType: {
      label: 'Type',
      render: (row) => {
        const type = row.allocationType || 'Forecasted';
        const canChange = (isAdmin || user?.role === 'Manager') && type === 'Forecasted';
        if (canChange) {
          return (
            <div className="type-actions">
              <button
                className="badge badge-success alloc-chip-btn"
                title="Approve this allocation"
                onClick={() => {
                  dispatch({
                    type: 'PATCH_ALLOCATION_TYPE',
                    payload: {
                      id: row.id,
                      allocationType: 'Approved',
                      lastModifiedBy: user?.displayName || 'Unknown',
                    },
                  });
                }}
              >
                Approve
              </button>
              <button
                className="badge badge-danger alloc-chip-btn"
                title="Cancel this allocation"
                onClick={() => {
                  dispatch({
                    type: 'PATCH_ALLOCATION_TYPE',
                    payload: {
                      id: row.id,
                      allocationType: 'Cancelled',
                      lastModifiedBy: user?.displayName || 'Unknown',
                    },
                  });
                }}
              >
                Cancel
              </button>
            </div>
          );
        }
        const badgeClass = type === 'Approved' ? 'badge-success' : type === 'Cancelled' ? 'badge-danger' : 'badge-warning';
        return <span className={`badge ${badgeClass}`}>{type}</span>;
      },
    },
    comment: {
      label: 'Comment',
      render: (row) => row.comment ? (
        <span className="comment-tooltip-wrapper">
          <MessageSquare size={15} className="comment-icon" />
          <span className="comment-tooltip-popup">{row.comment}</span>
        </span>
      ) : <span className="text-muted">-</span>,
    },
    lastModifiedBy: {
      label: 'Last Modified By',
      render: (row) => (
        <div className="modified-info">
          <span className="modified-by">{row.lastModifiedBy || '-'}</span>
          <span className="modified-at">{formatTimestamp(row.lastModifiedAt)}</span>
        </div>
      ),
    },
  }), [empMap, ccMap, isAdmin, user, dispatch]);

  // Build columns dynamically from schema, respecting visible toggle
  const columns = useMemo(() => {
    if (allocSchema.length === 0) {
      // Fallback: show all columns if schema hasn't loaded yet
      return Object.entries(columnRenderers).map(([key, col]) => ({ key, ...col }));
    }
    return allocSchema
      .filter(f => f.visible !== false)
      .map(field => {
        const renderer = columnRenderers[field.key];
        if (renderer) {
          return { key: field.key, label: field.label || renderer.label, render: renderer.render };
        }
        // Custom field: render from row data directly
        return {
          key: field.key,
          label: field.label,
          render: (row) => row[field.key] || <span className="text-muted">-</span>,
        };
      });
  }, [allocSchema, columnRenderers]);

  function openAdd() {
    setForm(emptyAlloc);
    setError('');
    setModal('add');
  }

  function isLocked(alloc) {
    const type = alloc.allocationType || 'Forecasted';
    return type === 'Approved' || type === 'Cancelled';
  }

  function openEdit(alloc) {
    if (!isAdmin || isLocked(alloc)) return;
    setForm({
      employeeId: alloc.employeeId,
      costCodeId: alloc.costCodeId,
      percentage: alloc.percentage,
      startDate: alloc.startDate,
      endDate: alloc.endDate,
      allocationType: alloc.allocationType || 'Forecasted',
      comment: alloc.comment || '',
    });
    setEditId(alloc.id);
    setError('');
    setModal('edit');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const pct = Number(form.percentage);
    if (isNaN(pct) || !form.percentage) {
      setError('Percentage must be a valid number.');
      return;
    }
    if (pct <= 0 || pct > 100) {
      setError('Percentage must be between 1 and 100.');
      return;
    }
    if (form.startDate > form.endDate) {
      setError('Start date must be before end date.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if ((form.allocationType || 'Forecasted') === 'Forecasted' && form.startDate < today) {
      setError('Start date for forecasted allocations cannot be in the past.');
      return;
    }

    // Enforce allocation window for non-admin users
    if (!isAdmin && windowActive) {
      if (form.startDate < allocationWindow.startDate || form.endDate > allocationWindow.endDate) {
        setError(`Allocation dates must be within the active window: ${formatDate(allocationWindow.startDate)} to ${formatDate(allocationWindow.endDate)}.`);
        return;
      }
    }

    const validation = validateAllocationPercentage(
      state.allocations,
      form.employeeId,
      pct,
      form.startDate,
      form.endDate,
      modal === 'edit' ? editId : null
    );

    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    const modifiedBy = user?.displayName || 'Unknown';

    if (modal === 'add') {
      const result = await dispatch({ type: 'ADD_ALLOCATION', payload: { ...form, percentage: pct, lastModifiedBy: modifiedBy } });
      if (result?.id) setHighlightId(result.id);
    } else {
      await dispatch({ type: 'UPDATE_ALLOCATION', payload: { id: editId, ...form, percentage: pct, lastModifiedBy: modifiedBy } });
    }
    setModal(null);
  }

  function handleDelete(id) {
    if (!isAdmin) return;
    if (confirm('Delete this allocation?')) {
      dispatch({ type: 'DELETE_ALLOCATION', payload: id });
    }
  }

  function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    const forecasted = state.allocations.filter(a => selectedIds.has(a.id) && (a.allocationType || 'Forecasted') === 'Forecasted');
    if (forecasted.length === 0) return;
    if (!confirm(`Approve ${forecasted.length} allocation(s)?`)) return;
    forecasted.forEach(a => {
      dispatch({
        type: 'PATCH_ALLOCATION_TYPE',
        payload: { id: a.id, allocationType: 'Approved', lastModifiedBy: user?.displayName || 'Unknown' },
      });
    });
    setSelectedIds(new Set());
  }

  function handleBulkCancel() {
    if (selectedIds.size === 0) return;
    const forecasted = state.allocations.filter(a => selectedIds.has(a.id) && (a.allocationType || 'Forecasted') === 'Forecasted');
    if (forecasted.length === 0) return;
    if (!confirm(`Cancel ${forecasted.length} allocation(s)?`)) return;
    forecasted.forEach(a => {
      dispatch({
        type: 'PATCH_ALLOCATION_TYPE',
        payload: { id: a.id, allocationType: 'Cancelled', lastModifiedBy: user?.displayName || 'Unknown' },
      });
    });
    setSelectedIds(new Set());
  }

  function handleBulkDelete() {
    if (!isAdmin || selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} allocation(s)? This cannot be undone.`)) return;
    selectedIds.forEach(id => {
      dispatch({ type: 'DELETE_ALLOCATION', payload: id });
    });
    setSelectedIds(new Set());
  }

  // Count how many selected are actionable (Forecasted)
  const selectedForecasted = useMemo(() => {
    return state.allocations.filter(a => selectedIds.has(a.id) && (a.allocationType || 'Forecasted') === 'Forecasted').length;
  }, [selectedIds, state.allocations]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Allocations</h1>
          {!isAdmin && (
            <div className="role-notice">
              <Lock size={13} /> You can add allocations. Only admins can edit or delete.
            </div>
          )}
          {windowActive && (
            <div className="role-notice" style={{ marginTop: 4, color: windowOpen ? 'var(--info)' : 'var(--danger)' }}>
              <Calendar size={13} /> Active allocation window: {formatDate(allocationWindow.startDate)} — {formatDate(allocationWindow.endDate)}
              {!isAdmin && (
                windowOpen
                  ? <span> (you can only add allocations within this period)</span>
                  : <span> — window is currently closed, adding allocations is disabled</span>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          {isAdmin && (
            <button className="btn" onClick={() => { setWindowForm({ ...allocationWindow }); setShowWindowModal(true); }}>
              <Settings size={15} /> Active Window
            </button>
          )}
          {isAdmin && (
            <button className="btn" onClick={() => exportFilteredAllocations(state.employees, state.costCodes, filteredAllocations)}>
              <Download size={15} /> Export
            </button>
          )}
          {isAdmin && (
            <ExcelUpload
              label="Allocations"
              sheetName="Allocations"
              requiredFields={['Employee ID', 'Cost Code', 'Percentage (%)', 'Start Date', 'End Date', 'Allocation Type']}
              parseRow={(r, rowNum, warns) => {
                const pct = Number(r['Percentage (%)']);
                if (isNaN(pct) || pct <= 0 || pct > 100) {
                  warns.push(`Row ${rowNum}: Invalid percentage "${r['Percentage (%)']}" — skipped.`);
                  return null;
                }
                const startDate = String(r['Start Date']).trim();
                const endDate = String(r['End Date']).trim();
                if (startDate > endDate) {
                  warns.push(`Row ${rowNum}: Start date after end date — skipped.`);
                  return null;
                }
                const costCodeInput = String(r['Cost Code']).trim();
                const cc = state.costCodes.find(c => c.code === costCodeInput);
                if (!cc) {
                  warns.push(`Row ${rowNum}: Cost Code "${costCodeInput}" not found — skipped.`);
                  return null;
                }
                return {
                  id: r.ID || r.id || uuidv4(),
                  employeeId: String(r['Employee ID']).trim(),
                  costCodeId: cc.id,
                  percentage: pct,
                  startDate,
                  endDate,
                  allocationType: r['Allocation Type'] ? String(r['Allocation Type']).trim() : 'Forecasted',
                  comment: r['Comment'] ? String(r['Comment']).trim() : '',
                  lastModifiedBy: 'Excel Import',
                  lastModifiedAt: new Date().toISOString(),
                };
              }}
              onImport={(data) => dispatch({ type: 'IMPORT_DATA', payload: { allocations: data } })}
            />
          )}
          <button className="btn btn-primary" onClick={openAdd} disabled={!canAdd} title={!canAdd ? 'Allocation window is not currently active' : ''}>
            <Plus size={16} /> Add Allocation
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (isAdmin || isManager) && (
        <div className="bulk-actions-bar">
          <span className="bulk-count">{selectedIds.size} selected{selectedForecasted < selectedIds.size ? ` (${selectedForecasted} actionable)` : ''}</span>
          <button className="btn btn-success btn-sm" onClick={handleBulkApprove} disabled={selectedForecasted === 0} title="Approve selected forecasted allocations">
            <CheckCircle size={14} /> Approve ({selectedForecasted})
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleBulkCancel} disabled={selectedForecasted === 0} title="Cancel selected forecasted allocations">
            <XCircle size={14} /> Cancel ({selectedForecasted})
          </button>
          {isAdmin && (
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} title="Delete selected allocations">
              <Trash2 size={14} /> Delete ({selectedIds.size})
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setSelectedIds(new Set())}>Clear Selection</button>
        </div>
      )}

      <div className="filters-bar">
        <label className="filter-item">
          <span>Start Date</span>
          <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
        </label>
        <label className="filter-item">
          <span>End Date</span>
          <input type="date" value={filterEndDate} min={filterStartDate} onChange={e => setFilterEndDate(e.target.value)} />
        </label>
        <label className="filter-item">
          <span>Employee</span>
          <input type="text" placeholder="Search employee..." value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} />
        </label>
        <label className="filter-item">
          <span>Cost Code</span>
          <select value={filterCostCode} onChange={e => setFilterCostCode(e.target.value)}>
            <option value="">All Cost Codes</option>
            {[...new Map(state.costCodes.map(cc => [cc.id, cc])).values()].map(cc => (
              <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
            ))}
          </select>
        </label>
        <label className="filter-item">
          <span>Type</span>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            <option value="Forecasted">Forecasted</option>
            <option value="Approved">Approved</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </label>
        <label className="filter-item">
          <span>Classification</span>
          <select value={filterClassification} onChange={e => setFilterClassification(e.target.value)}>
            <option value="">All Classifications</option>
            {classifications.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="filter-item">
          <span>POD</span>
          <select value={filterPod} onChange={e => setFilterPod(e.target.value)}>
            <option value="">All PODs</option>
            {pods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {(filterStartDate !== todayStr || filterEndDate !== defaultEndStr || filterEmployee || filterCostCode || filterType || filterClassification || filterPod) && (
          <button className="btn btn-sm" onClick={() => { setFilterStartDate(todayStr); setFilterEndDate(defaultEndStr); setFilterEmployee(''); setFilterCostCode(''); setFilterType(''); setFilterClassification(''); setFilterPod(''); }}>
            Clear Filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredAllocations}
        searchPlaceholder="Search allocations..."
        selectable={isAdmin || isManager}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        highlightId={highlightId}
        actions={(row) => (
          <>
            {isAdmin ? (
              isLocked(row) ? (
                <span className="text-muted" title={`${row.allocationType} — locked`}><Lock size={14} /></span>
              ) : (
                <>
                  <button className="btn-icon" title="Edit" onClick={() => openEdit(row)}><Edit2 size={15} /></button>
                  <button className="btn-icon danger" title="Delete" onClick={() => handleDelete(row.id)}><Trash2 size={15} /></button>
                </>
              )
            ) : (
              <span className="text-muted" title="Admin only"><Lock size={14} /></span>
            )}
          </>
        )}
      />

      {showWindowModal && (
        <Modal title="Allocation Active Window" onClose={() => setShowWindowModal(false)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (windowForm.enabled && (!windowForm.startDate || !windowForm.endDate)) return;
            if (windowForm.enabled && windowForm.startDate > windowForm.endDate) return;
            dispatch({ type: 'SET_ALLOCATION_WINDOW', payload: windowForm });
            setShowWindowModal(false);
          }} className="form">
            <p className="text-muted" style={{ marginBottom: 12, fontSize: '0.85rem' }}>
              Set the active date window during which Managers are allowed to add allocations. Admins are not restricted by this window.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={windowForm.enabled}
                onChange={e => setWindowForm({ ...windowForm, enabled: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Enable allocation window
            </label>
            {windowForm.enabled && (
              <div className="form-row" style={{ marginTop: 12 }}>
                <label>
                  Window Start Date *
                  <input type="date" required value={windowForm.startDate} onChange={e => setWindowForm({ ...windowForm, startDate: e.target.value })} />
                </label>
                <label>
                  Window End Date *
                  <input type="date" required min={windowForm.startDate} value={windowForm.endDate} onChange={e => setWindowForm({ ...windowForm, endDate: e.target.value })} />
                </label>
              </div>
            )}
            {windowForm.enabled && windowForm.startDate && windowForm.endDate && windowForm.startDate > windowForm.endDate && (
              <div className="form-error"><AlertTriangle size={16} /> Start date must be before end date.</div>
            )}
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setShowWindowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Add Allocation' : 'Edit Allocation'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="form">
            {error && <div className="form-error"><AlertTriangle size={16} /> {error}</div>}
            <SearchableSelect
              label="Employee *"
              required
              value={form.employeeId}
              onChange={v => setForm({ ...form, employeeId: v })}
              placeholder="Select employee..."
              options={state.employees.map(emp => ({ value: emp.id, label: emp.name }))}
            />
            <SearchableSelect
              label="Cost Code *"
              required
              value={form.costCodeId}
              onChange={v => setForm({ ...form, costCodeId: v })}
              placeholder="Select cost code..."
              options={(() => {
                const seen = new Set();
                return state.costCodes
                  .filter(cc => {
                    if (seen.has(cc.code)) return false;
                    seen.add(cc.code);
                    if (benchCostCodeCode && cc.code === benchCostCodeCode) return false;
                    if (!form.startDate || !form.endDate) return true;
                    if (!cc.startDate || !cc.expiryDate) return true;
                    return cc.startDate <= form.startDate && cc.expiryDate >= form.endDate;
                  })
                  .map(cc => ({ value: cc.id, label: `${cc.code} — ${cc.name}${cc.expiryDate ? ` (expires ${formatDate(cc.expiryDate)})` : ''}` }));
              })()}
            />
            {form.startDate && form.endDate && (
              <span className="helper-text">
                Only showing cost codes active between {formatDate(form.startDate)} and {formatDate(form.endDate)}
              </span>
            )}
            <label>
              Percentage (%) *
              <input
                type="number"
                required
                min="1"
                max="100"
                value={form.percentage}
                onChange={e => { setForm({ ...form, percentage: e.target.value }); setError(''); }}
              />
              {form.employeeId && form.startDate && (
                <span className="helper-text">
                  Currently allocated: {getEmployeeTotalAllocation(state.allocations, form.employeeId, form.startDate, modal === 'edit' ? editId : null)}%
                </span>
              )}
            </label>
            <div className="form-row">
              <label>
                Start Date *
                <input
                  type="date"
                  required
                  min={!isAdmin && windowActive ? allocationWindow.startDate : (form.allocationType || 'Forecasted') === 'Forecasted' ? new Date().toISOString().slice(0, 10) : undefined}
                  max={!isAdmin && windowActive ? allocationWindow.endDate : undefined}
                  value={form.startDate}
                  onChange={e => {
                    const newStart = e.target.value;
                    const updates = { startDate: newStart };
                    if (form.endDate && newStart > form.endDate) updates.endDate = newStart;
                    setForm({ ...form, ...updates });
                  }}
                />
              </label>
              <label>
                End Date *
                <input
                  type="date"
                  required
                  min={form.startDate || (!isAdmin && windowActive ? allocationWindow.startDate : undefined)}
                  max={!isAdmin && windowActive ? allocationWindow.endDate : undefined}
                  value={form.endDate}
                  onChange={e => {
                    const val = e.target.value;
                    if (form.startDate && val < form.startDate) return;
                    setForm({ ...form, endDate: val });
                  }}
                />
              </label>
            </div>
            {!isAdmin && windowActive && (
              <span className="helper-text">
                <Calendar size={12} /> Dates must be within: {formatDate(allocationWindow.startDate)} — {formatDate(allocationWindow.endDate)}
              </span>
            )}
            <label>
              Allocation Type *
              <select required value={form.allocationType} onChange={e => setForm({ ...form, allocationType: e.target.value })}>
                <option value="Forecasted">Forecasted</option>
                <option value="Approved">Approved</option>
              </select>
            </label>
            <label>
              Comment
              <textarea
                value={form.comment}
                onChange={e => setForm({ ...form, comment: e.target.value })}
                placeholder="Add a comment or note..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </label>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{modal === 'add' ? 'Add' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
