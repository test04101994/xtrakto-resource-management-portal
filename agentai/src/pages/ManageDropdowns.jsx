import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Lock, Plus, X, Download, Upload, Save, AlertCircle, CheckCircle, Edit2, Eye, EyeOff, Trash2, Settings, Columns, List, Sliders } from 'lucide-react';
import * as XLSX from 'xlsx';

const CATEGORIES = [
  { key: 'subBand', label: 'Sub Band', description: 'Employee sub-band classifications' },
  { key: 'jobFunction', label: 'Job Function', description: 'Primary job functions' },
  { key: 'subJobFunction', label: 'Sub Job Function', description: 'Specialized job function areas' },
  { key: 'roleName', label: 'Role Name', description: 'Specific role titles' },
  { key: 'sgu', label: 'SGU', description: 'Service Group Units' },
  { key: 'imu', label: 'IMU', description: 'Industry Market Units' },
  { key: 'country', label: 'Country', description: 'Employee country locations' },
  { key: 'classification', label: 'Classification', description: 'Employee classification (e.g. Core, Non-Core)' },
  { key: 'pod', label: 'POD', description: 'Employee POD assignments' },
  { key: 'costCodeCategory', label: 'Cost Code Category', description: 'Cost code category classifications' },
];

const ENTITY_TABS = [
  { key: 'employees', label: 'Employees' },
  { key: 'costCodes', label: 'Cost Codes' },
  { key: 'allocations', label: 'Allocations' },
  { key: 'availableResources', label: 'Available Resources' },
  { key: 'consolidatedAllocations', label: 'Consolidated View' },
];

const TYPE_LABELS = { text: 'Text', dropdown: 'Dropdown', date: 'Date', employeeRef: 'Employee Ref', employeeName: 'Employee Name', costCodeRef: 'Cost Code Ref', number: 'Number' };
const TYPE_COLORS = { text: 'badge-neutral', dropdown: 'badge-info', date: 'badge-warning', employeeRef: 'badge-neutral', employeeName: 'badge-neutral', costCodeRef: 'badge-neutral', number: 'badge-neutral' };

const TOP_TABS = [
  { key: 'dropdowns', label: 'Dropdown Values', icon: List },
  { key: 'fields', label: 'Field Configuration', icon: Columns },
  { key: 'settings', label: 'System Settings', icon: Sliders },
];

export default function ManageDropdowns() {
  const { state, dispatch } = useAppContext();
  const { isAdmin } = useAuth();
  const [activeTopTab, setActiveTopTab] = useState('dropdowns');

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Configuration Settings</h1>
        </div>
        <div className="role-notice"><Lock size={13} /> Only admins can manage configuration settings.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuration Settings</h1>
          <p className="text-muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
            Manage dropdown values, field configuration, and system settings.
          </p>
        </div>
      </div>

      {/* Top-Level Tabs */}
      <div className="config-tabs" style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--border-light)' }}>
        {TOP_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`config-tab ${activeTopTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTopTab(tab.key)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTopTab === 'dropdowns' && <DropdownValuesTab state={state} dispatch={dispatch} />}
      {activeTopTab === 'fields' && <FieldConfigurationTab state={state} dispatch={dispatch} />}
      {activeTopTab === 'settings' && <SystemSettingsTab state={state} dispatch={dispatch} />}
    </div>
  );
}

// ============================================================
// TAB 1: Dropdown Values
// ============================================================
function DropdownValuesTab({ state, dispatch }) {
  const [editCategory, setEditCategory] = useState(null);
  const [editValues, setEditValues] = useState([]);
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  function startEdit(cat) {
    setEditCategory(cat.key);
    setEditValues([...(state.lookups?.[cat.key] || [])]);
    setNewValue('');
    setSuccess('');
    setError('');
  }

  function addValue() {
    const v = newValue.trim();
    if (!v) return;
    if (editValues.includes(v)) { setError(`"${v}" already exists`); return; }
    setEditValues([...editValues, v].sort());
    setNewValue('');
    setError('');
  }

  function removeValue(v) { setEditValues(editValues.filter(x => x !== v)); }

  async function saveCategory() {
    setSaving(true);
    setError('');
    try {
      await dispatch({ type: 'UPDATE_LOOKUP', payload: { category: editCategory, values: editValues } });
      setSuccess(`${CATEGORIES.find(c => c.key === editCategory)?.label} values updated successfully`);
      setEditCategory(null);
    } catch (err) { setError(err.message); }
    setSaving(false);
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    CATEGORIES.forEach(cat => {
      const values = state.lookups?.[cat.key] || [];
      const aoa = [[cat.label], ...values.map(v => [v])];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, cat.label);
    });
    XLSX.writeFile(wb, 'Dropdown_Values.xlsx');
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    const reader = new FileReader();
    reader.onload = async (evt) => {
      let lookups; let totalValues = 0;
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        lookups = {};
        CATEGORIES.forEach(cat => {
          const sheetName = wb.SheetNames.find(s => s.toLowerCase() === cat.label.toLowerCase());
          if (sheetName) {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            const values = rows.slice(1).map(row => (row[0] != null ? String(row[0]).trim() : '')).filter(Boolean);
            if (values.length > 0) { lookups[cat.key] = values; totalValues += values.length; }
          }
        });
        if (Object.keys(lookups).length === 0) {
          setError('No valid data found. Ensure sheets are named: Sub Band, Job Function, etc.');
          return;
        }
      } catch (err) { setError('Failed to parse Excel file: ' + err.message); return; }
      try {
        await dispatch({ type: 'IMPORT_LOOKUPS', payload: lookups });
        const cats = Object.keys(lookups).map(k => CATEGORIES.find(c => c.key === k)?.label).join(', ');
        setSuccess(`Imported ${totalValues} values across: ${cats}`);
      } catch (err) { setError('Failed to save: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  const editingCat = CATEGORIES.find(c => c.key === editCategory);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Manage accepted values for form dropdowns. Upload an Excel or edit inline.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={downloadTemplate}><Download size={14} /> Download</button>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> Upload
            <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {success && <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><CheckCircle size={16} /> {success}</div>}
      {error && !editCategory && <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><AlertCircle size={16} /> {error}</div>}

      <div className="dropdown-cards-grid">
        {CATEGORIES.map(cat => {
          const values = state.lookups?.[cat.key] || [];
          return (
            <div key={cat.key} className="dropdown-card">
              <div className="dropdown-card-header">
                <div>
                  <h3>{cat.label}</h3>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{cat.description}</span>
                </div>
                <span className="badge badge-info">{values.length}</span>
              </div>
              <div className="dropdown-values-list">
                {values.map(v => <div key={v} className="dropdown-value-chip readonly">{v}</div>)}
                {values.length === 0 && <div className="text-muted" style={{ padding: 8 }}>No values configured</div>}
              </div>
              <div className="dropdown-card-actions">
                <button className="btn btn-sm" onClick={() => startEdit(cat)}><Edit2 size={12} /> Edit Values</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editCategory && editingCat && (
        <div className="modal-overlay" onClick={() => setEditCategory(null)}>
          <div className="modal dropdown-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit {editingCat.label} Values</h2>
              <button className="btn-icon" onClick={() => setEditCategory(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><AlertCircle size={14} /> {error}</div>}
              <div className="dropdown-add-row">
                <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder={`Type a new ${editingCat.label.toLowerCase()} and press Enter`} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addValue(); } }} />
                <button type="button" className="btn btn-sm btn-primary" onClick={(e) => { e.preventDefault(); e.stopPropagation(); addValue(); }}><Plus size={14} /> Add</button>
              </div>
              <div className="dropdown-values-list editable" style={{ maxHeight: 320, minHeight: 100 }}>
                {editValues.length === 0 ? (
                  <div className="text-muted" style={{ padding: 16, textAlign: 'center', width: '100%' }}>No values yet. Add your first value above.</div>
                ) : editValues.map(v => (
                  <div key={v} className="dropdown-value-chip">
                    <span>{v}</span>
                    <button className="chip-remove" onClick={() => removeValue(v)} title={`Remove "${v}"`}><X size={12} /></button>
                  </div>
                ))}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{editValues.length} value{editValues.length !== 1 ? 's' : ''} · Changes are saved when you click Save</div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditCategory(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveCategory} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 2: Field Configuration
// ============================================================
function FieldConfigurationTab({ state, dispatch }) {
  const [activeEntity, setActiveEntity] = useState('employees');
  const [showAddField, setShowAddField] = useState(false);
  const [newField, setNewField] = useState({ label: '', type: 'text', required: false, dropdownOptions: [] });
  const [newOptionValue, setNewOptionValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [localFields, setLocalFields] = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const schema = state.schemas?.[activeEntity];
  const fields = localFields || schema?.fields || [];
  const isConsolidated = activeEntity === 'consolidatedAllocations';
  const hasChanges = localFields !== null;

  function startEditing() {
    setLocalFields([...(schema?.fields || []).map(f => ({ ...f }))]);
    setSuccess(''); setError('');
  }

  function cancelEditing() { setLocalFields(null); setShowAddField(false); setError(''); }

  function toggleVisibility(idx) {
    if (!localFields) startEditing();
    const updated = [...(localFields || schema?.fields || []).map(f => ({ ...f }))];
    updated[idx] = { ...updated[idx], visible: !updated[idx].visible };
    setLocalFields(updated);
  }

  function toggleRequired(idx) {
    if (!localFields) startEditing();
    const updated = [...(localFields || schema?.fields || []).map(f => ({ ...f }))];
    if (updated[idx].builtIn) return;
    updated[idx] = { ...updated[idx], required: !updated[idx].required };
    setLocalFields(updated);
  }

  function deleteField(idx) {
    if (!localFields) return;
    if (localFields[idx].builtIn) return;
    if (!confirm(`Delete custom field "${localFields[idx].label}"?`)) return;
    setLocalFields(localFields.filter((_, i) => i !== idx));
  }

  function addCustomField() {
    if (!newField.label.trim()) { setError('Field label is required'); return; }
    const key = 'custom_' + newField.label.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    if ((localFields || schema?.fields || []).some(f => f.key === key)) { setError('A field with this name already exists'); return; }
    const field = { key, label: newField.label.trim(), type: newField.type, builtIn: false, visible: true, required: newField.required, excelHeader: newField.label.trim() };
    if (newField.type === 'dropdown' && newField.dropdownOptions.length > 0) field.dropdownOptions = [...newField.dropdownOptions];
    if (!localFields) startEditing();
    setLocalFields([...(localFields || schema?.fields || []).map(f => ({ ...f })), field]);
    setNewField({ label: '', type: 'text', required: false, dropdownOptions: [] });
    setNewOptionValue(''); setShowAddField(false); setError('');
  }

  function addDropdownOption() {
    const v = newOptionValue.trim();
    if (!v || newField.dropdownOptions.includes(v)) return;
    setNewField({ ...newField, dropdownOptions: [...newField.dropdownOptions, v].sort() });
    setNewOptionValue('');
  }

  async function saveSchema() {
    if (!localFields) return;
    setSaving(true); setError('');
    try {
      await dispatch({ type: 'UPDATE_SCHEMA', payload: { entityType: activeEntity, fields: localFields } });
      setLocalFields(null);
      setSuccess('Field configuration saved successfully');
    } catch (err) { setError('Failed to save: ' + err.message); }
    setSaving(false);
  }

  return (
    <div>
      <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.85rem' }}>
        Control which columns are visible on each page, add custom fields, and manage required fields. Toggle the <Eye size={13} style={{ verticalAlign: 'middle' }} /> icon to show/hide columns.
      </p>

      {success && <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><CheckCircle size={16} /> {success}</div>}

      {/* Entity Sub-Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border-light)' }}>
        {ENTITY_TABS.map(tab => (
          <button
            key={tab.key}
            className={`config-tab ${activeEntity === tab.key ? 'active' : ''}`}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            onClick={() => { setActiveEntity(tab.key); setLocalFields(null); setShowAddField(false); setError(''); setSuccess(''); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Field List Table */}
      <div className="table-container" style={{ marginBottom: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Visible</th>
              <th>Field Name</th>
              <th style={{ width: 100 }}>Type</th>
              {!isConsolidated && <th style={{ width: 80 }}>Required</th>}
              {!isConsolidated && <th style={{ width: 80 }}>Source</th>}
              {!isConsolidated && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {fields.map((field, idx) => (
              <tr key={field.key} style={{ opacity: field.visible ? 1 : 0.45 }}>
                <td style={{ textAlign: 'center' }}>
                  <button className="btn-icon" onClick={() => toggleVisibility(idx)} title={field.visible ? 'Hide column' : 'Show column'}>
                    {field.visible ? <Eye size={15} color="var(--primary)" /> : <EyeOff size={15} />}
                  </button>
                </td>
                <td>
                  <strong>{field.label}</strong>
                  {field.excelHeader && field.excelHeader !== field.label && (
                    <span className="text-muted" style={{ fontSize: '0.72rem', marginLeft: 8 }}>Excel: {field.excelHeader}</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${TYPE_COLORS[field.type] || 'badge-neutral'}`} style={{ fontSize: '0.7rem' }}>
                    {TYPE_LABELS[field.type] || field.type}
                  </span>
                </td>
                {!isConsolidated && (
                  <td style={{ textAlign: 'center' }}>
                    {field.builtIn
                      ? <span className="text-muted">{field.required ? 'Yes' : 'No'}</span>
                      : <input type="checkbox" checked={field.required || false} onChange={() => toggleRequired(idx)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    }
                  </td>
                )}
                {!isConsolidated && (
                  <td>
                    <span className={`badge ${field.builtIn ? 'badge-neutral' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                      {field.builtIn ? 'Built-in' : 'Custom'}
                    </span>
                  </td>
                )}
                {!isConsolidated && (
                  <td>
                    {!field.builtIn && localFields && (
                      <button className="btn-icon danger" onClick={() => deleteField(idx)} title="Delete"><Trash2 size={14} /></button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><AlertCircle size={14} /> {error}</div>}

      {/* Add Custom Field Form */}
      {!isConsolidated && showAddField && (
        <div className="dropdown-card" style={{ marginBottom: 16, maxWidth: 600 }}>
          <h3 style={{ margin: '0 0 12px' }}>Add Custom Field</h3>
          <div className="form" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-row">
              <label>
                Field Label *
                <input value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} placeholder="e.g. Department" autoFocus />
              </label>
              <label>
                Type *
                <select value={newField.type} onChange={e => setNewField({ ...newField, type: e.target.value, dropdownOptions: [] })}>
                  <option value="text">Text</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="date">Date</option>
                </select>
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={newField.required} onChange={e => setNewField({ ...newField, required: e.target.checked })} style={{ width: 'auto' }} />
              Required field
            </label>
            {newField.type === 'dropdown' && (
              <div>
                <label style={{ marginBottom: 8, display: 'block' }}>Dropdown Options</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={newOptionValue} onChange={e => setNewOptionValue(e.target.value)} placeholder="Add option..."
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDropdownOption(); } }} style={{ flex: 1 }} />
                  <button type="button" className="btn btn-sm" onClick={addDropdownOption}><Plus size={12} /> Add</button>
                </div>
                <div className="dropdown-values-list" style={{ minHeight: 30 }}>
                  {newField.dropdownOptions.map(v => (
                    <div key={v} className="dropdown-value-chip"><span>{v}</span>
                      <button className="chip-remove" onClick={() => setNewField({ ...newField, dropdownOptions: newField.dropdownOptions.filter(x => x !== v) })}><X size={12} /></button>
                    </div>
                  ))}
                  {newField.dropdownOptions.length === 0 && <span className="text-muted" style={{ fontSize: '0.8rem' }}>No options added yet</span>}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => { setShowAddField(false); setNewField({ label: '', type: 'text', required: false, dropdownOptions: [] }); }}>Cancel</button>
              <button className="btn btn-primary" onClick={addCustomField}><Plus size={14} /> Add Field</button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!isConsolidated && !showAddField && (
          <button className="btn" onClick={() => { if (!localFields) startEditing(); setShowAddField(true); }}>
            <Plus size={14} /> Add Custom Field
          </button>
        )}
        {!hasChanges && !showAddField && (
          <button className="btn" onClick={startEditing}><Edit2 size={14} /> Edit Fields</button>
        )}
        {hasChanges && (
          <>
            <button className="btn" onClick={cancelEditing}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSchema} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB 3: System Settings
// ============================================================
const TIMEOUT_OPTIONS = [
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '480', label: '8 hours' },
  { value: '0', label: 'Never (no auto-logout)' },
];

function SystemSettingsTab({ state, dispatch }) {
  const currentBenchId = state.lookups?.['bench-cost-code']?.[0] || '';
  const [selectedBenchId, setSelectedBenchId] = useState(currentBenchId);
  const [benchSaving, setBenchSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const currentTimeout = state.lookups?.['session-timeout']?.[0] || '15';
  const [selectedTimeout, setSelectedTimeout] = useState(currentTimeout);
  const [timeoutSaving, setTimeoutSaving] = useState(false);

  const currentVersion = state.lookups?.['app-version']?.[0] || '1';
  const [versionBumping, setVersionBumping] = useState(false);

  useMemo(() => {
    setSelectedBenchId(state.lookups?.['bench-cost-code']?.[0] || '');
  }, [state.lookups?.['bench-cost-code']]);

  useMemo(() => {
    setSelectedTimeout(state.lookups?.['session-timeout']?.[0] || '15');
  }, [state.lookups?.['session-timeout']]);

  async function saveBenchCostCode() {
    setBenchSaving(true); setError('');
    try {
      await dispatch({ type: 'UPDATE_LOOKUP', payload: { category: 'bench-cost-code', values: selectedBenchId ? [selectedBenchId] : [] } });
      setSuccess(selectedBenchId ? 'Bench cost code updated successfully' : 'Bench cost code cleared');
    } catch (err) { setError(err.message); }
    setBenchSaving(false);
  }

  async function saveSessionTimeout() {
    setTimeoutSaving(true); setError('');
    try {
      await dispatch({ type: 'UPDATE_LOOKUP', payload: { category: 'session-timeout', values: [selectedTimeout] } });
      setSuccess(`Session timeout updated to ${TIMEOUT_OPTIONS.find(o => o.value === selectedTimeout)?.label || selectedTimeout + ' minutes'}`);
    } catch (err) { setError(err.message); }
    setTimeoutSaving(false);
  }

  async function bumpVersion() {
    setVersionBumping(true); setError('');
    try {
      const newVersion = String(parseInt(currentVersion, 10) + 1);
      await dispatch({ type: 'UPDATE_LOOKUP', payload: { category: 'app-version', values: [newVersion] } });
      setSuccess(`App version bumped to v${newVersion}. All active users will auto-refresh within 2 minutes.`);
    } catch (err) { setError(err.message); }
    setVersionBumping(false);
  }

  return (
    <div>
      {success && <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><CheckCircle size={16} /> {success}</div>}
      {error && <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><AlertCircle size={16} /> {error}</div>}

      <div className="dropdown-card" style={{ maxWidth: 520, marginBottom: 20 }}>
        <div className="dropdown-card-header">
          <h3>Bench Cost Code</h3>
          {currentBenchId && <span className="badge badge-info">Active</span>}
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>
          Select the default cost code for unallocated bench time. Used in the Consolidated View and Dashboard to fill remaining capacity.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedBenchId} onChange={e => setSelectedBenchId(e.target.value)} style={{ flex: 1 }}>
            <option value="">None (No bench code)</option>
            {state.costCodes.map(cc => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" onClick={saveBenchCostCode} disabled={benchSaving || selectedBenchId === currentBenchId}>
            <Save size={12} /> {benchSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="dropdown-card" style={{ maxWidth: 520, marginBottom: 20 }}>
        <div className="dropdown-card-header">
          <h3>Session Timeout</h3>
          <span className="badge badge-neutral">{TIMEOUT_OPTIONS.find(o => o.value === currentTimeout)?.label || currentTimeout + ' min'}</span>
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>
          Auto-logout users after a period of inactivity. Changes take effect on next login.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedTimeout} onChange={e => setSelectedTimeout(e.target.value)} style={{ flex: 1 }}>
            {TIMEOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" onClick={saveSessionTimeout} disabled={timeoutSaving || selectedTimeout === currentTimeout}>
            <Save size={12} /> {timeoutSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="dropdown-card" style={{ maxWidth: 520 }}>
        <div className="dropdown-card-header">
          <h3>Force Refresh All Users</h3>
          <span className="badge badge-neutral">v{currentVersion}</span>
        </div>
        <p className="text-muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>
          Bump the app version to force all active users to auto-refresh their browser within 2 minutes. Use after deploying changes.
        </p>
        <button className="btn btn-sm btn-primary" onClick={bumpVersion} disabled={versionBumping}>
          {versionBumping ? 'Refreshing...' : `Bump to v${parseInt(currentVersion, 10) + 1} & Refresh All`}
        </button>
      </div>
    </div>
  );
}
