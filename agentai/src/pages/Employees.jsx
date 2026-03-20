import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, Trash2, Lock } from 'lucide-react';
import ExcelUpload from '../components/ExcelUpload';
import { v4 as uuidv4 } from 'uuid';
import { formatDate } from '../utils/dateUtils';

export default function Employees() {
  const { state, dispatch } = useAppContext();
  const { isAdmin } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [filters, setFilters] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const schema = state.schemas?.employees;
  const schemaFields = schema?.fields || [];

  const empMap = useMemo(() => Object.fromEntries(state.employees.map(e => [e.id, e])), [state.employees]);

  // Build empty form from schema
  const emptyForm = useMemo(() => {
    const obj = { id: '' };
    schemaFields.forEach(f => { if (f.key !== 'id') obj[f.key] = ''; });
    return obj;
  }, [schemaFields]);

  // Get dropdown options for a field
  function getDropdownOptions(field) {
    if (field.lookupCategory) {
      const lookupVals = state.lookups?.[field.lookupCategory] || [];
      const dataVals = [...new Set(state.employees.map(e => e[field.key]).filter(Boolean))];
      return [...new Set([...lookupVals, ...dataVals])].sort();
    }
    if (field.dropdownOptions) return field.dropdownOptions;
    // For custom dropdowns with no options yet, pull unique values from data
    return [...new Set(state.employees.map(e => e[field.key]).filter(Boolean))].sort();
  }

  // Ensure current form value is in options
  function withCurrent(options, currentVal) {
    if (!currentVal || options.includes(currentVal)) return options;
    return [...options, currentVal].sort();
  }

  // Filter fields (dropdown/custom dropdown fields that are visible)
  const filterableFields = useMemo(() =>
    schemaFields.filter(f => f.visible && (f.type === 'dropdown') && f.key !== 'id'),
    [schemaFields]
  );

  // Unique values per filterable field
  const filterOptions = useMemo(() => {
    const opts = {};
    filterableFields.forEach(f => {
      opts[f.key] = [...new Set(state.employees.map(e => e[f.key]).filter(Boolean))].sort();
    });
    return opts;
  }, [filterableFields, state.employees]);

  // Calculate total allocation for each employee
  const employeesWithAlloc = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return state.employees.map(emp => {
      const empAllocs = state.allocations.filter(a => a.employeeId === emp.id && a.startDate <= today && a.endDate >= today);
      const totalAlloc = empAllocs.reduce((s, a) => s + a.percentage, 0);
      return { ...emp, totalAllocation: totalAlloc };
    });
  }, [state.employees, state.allocations]);

  const filteredEmployees = useMemo(() => {
    let result = employeesWithAlloc;
    Object.entries(filters).forEach(([key, val]) => {
      if (val) result = result.filter(e => e[key] === val);
    });
    return result;
  }, [employeesWithAlloc, filters]);

  // Build columns from schema
  const columns = useMemo(() => {
    // Special render overrides for built-in fields
    const renderOverrides = {
      id: (row) => <span className="text-muted">{row.id}</span>,
      avpName: (row) => row.avpName ? (empMap[row.avpName]?.name || row.avpName) : <span className="text-muted">-</span>,
      vpName: (row) => row.vpName ? (empMap[row.vpName]?.name || row.vpName) : <span className="text-muted">-</span>,
      cdoLeader: (row) => row.cdoLeader ? (empMap[row.cdoLeader]?.name || row.cdoLeader) : <span className="text-muted">-</span>,
    };

    return schemaFields
      .filter(f => f.visible)
      .map(f => ({
        key: f.key,
        label: f.label,
        render: renderOverrides[f.key] || (f.type === 'date' ? (row) => formatDate(row[f.key]) : undefined),
      }));
  }, [schemaFields, empMap]);

  // Build Excel template headers and required fields from schema
  const templateHeaders = useMemo(() =>
    schemaFields.filter(f => f.visible && f.excelHeader).map(f => f.excelHeader),
    [schemaFields]
  );

  const templateSample = useMemo(() =>
    schemaFields.filter(f => f.visible && f.excelHeader).map(f => {
      if (f.key === 'id') return 'emp-1';
      if (f.type === 'date') return '2025-01-01';
      if (f.type === 'dropdown') {
        const opts = getDropdownOptions(f);
        return opts[0] || '';
      }
      return f.label;
    }),
    [schemaFields]
  );

  const requiredExcelFields = useMemo(() =>
    schemaFields.filter(f => f.visible && f.required && f.key !== 'id' && f.excelHeader).map(f => f.excelHeader),
    [schemaFields]
  );

  function parseRow(r) {
    const item = { id: r.ID || r.id || r['Emp ID'] || uuidv4() };
    schemaFields.forEach(f => {
      if (f.key === 'id') return;
      const val = r[f.excelHeader];
      item[f.key] = val ? String(val).trim() : '';
    });
    return item;
  }

  function openAdd() {
    setForm({ ...emptyForm, id: uuidv4() });
    setEditId(null);
    setModal('add');
  }

  function openEdit(emp) {
    const f = { id: emp.id };
    schemaFields.forEach(field => {
      if (field.key !== 'id') f[field.key] = emp[field.key] || '';
    });
    setForm(f);
    setEditId(emp.id);
    setModal('edit');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (modal === 'add') {
      if (!form.id || !form.id.trim()) return;
      dispatch({ type: 'ADD_EMPLOYEE', payload: form });
    } else {
      const newId = form.id.trim();
      if (newId !== editId) {
        dispatch({ type: 'RENAME_EMPLOYEE_ID', payload: { oldId: editId, newId, updates: form } });
      } else {
        dispatch({ type: 'UPDATE_EMPLOYEE', payload: { id: editId, ...form } });
      }
    }
    setModal(null);
  }

  function handleDelete(id) {
    if (confirm('Delete this employee and all their allocations?')) {
      dispatch({ type: 'DELETE_EMPLOYEE', payload: id });
    }
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} selected employee(s) and all their allocations? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await dispatch({ type: 'BULK_DELETE_EMPLOYEES', payload: [...selectedIds] });
      setSelectedIds(new Set());
    } catch (err) {
      alert('Bulk delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);

  // Render a form field based on schema field definition
  function renderFormField(field) {
    if (field.key === 'id') return null; // handled separately

    if (field.type === 'employeeRef') {
      return (
        <label key={field.key}>
          {field.label}{field.required ? ' *' : ''}
          <select required={field.required} value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })}>
            <option value="">Select {field.label}</option>
            {state.employees.filter(emp => emp.id !== editId).map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === 'dropdown') {
      const options = withCurrent(getDropdownOptions(field), form[field.key]);
      return (
        <label key={field.key}>
          {field.label}{field.required ? ' *' : ''}
          <select required={field.required} value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })}>
            <option value="">Select {field.label}</option>
            {options.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      );
    }

    if (field.type === 'date') {
      return (
        <label key={field.key}>
          {field.label}{field.required ? ' *' : ''}
          <input type="date" required={field.required} value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
        </label>
      );
    }

    // Default: text
    return (
      <label key={field.key}>
        {field.label}{field.required ? ' *' : ''}
        <input required={field.required} value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
      </label>
    );
  }

  // Group form fields in pairs for form-row layout
  const formFields = schemaFields.filter(f => f.key !== 'id');
  const formRows = [];
  for (let i = 0; i < formFields.length; i += 2) {
    formRows.push(formFields.slice(i, i + 2));
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Employees</h1>
          {!isAdmin && <div className="role-notice"><Lock size={13} /> Read-only. Only admins can manage employees.</div>}
        </div>
        {isAdmin && (
          <div className="header-actions">
            <ExcelUpload
              label="Employees"
              sheetName="Employees"
              headers={templateHeaders}
              sampleRow={templateSample}
              requiredFields={requiredExcelFields}
              parseRow={parseRow}
              onImport={(data) => dispatch({ type: 'IMPORT_DATA', payload: { employees: data } })}
            />
            {selectedIds.size > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={deleting}>
                <Trash2 size={14} /> Delete {selectedIds.size} Selected
              </button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={14} /> Add Employee
            </button>
          </div>
        )}
      </div>

      <div className="filters-bar">
        {filterableFields.map(f => (
          <label key={f.key} className="filter-item">
            <span>{f.label}</span>
            <select value={filters[f.key] || ''} onChange={e => setFilters({ ...filters, [f.key]: e.target.value })}>
              <option value="">All {f.label}s</option>
              {(filterOptions[f.key] || []).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ))}
        {hasFilters && (
          <button className="btn btn-sm" onClick={() => setFilters({})}>
            Clear Filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredEmployees}
        searchPlaceholder="Search employees..."
        selectable={isAdmin}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        actions={isAdmin ? (row) => (
          <>
            <button className="btn-icon" title="Edit" onClick={() => openEdit(row)}><Edit2 size={14} /></button>
            <button className="btn-icon danger" title="Delete" onClick={() => handleDelete(row.id)}><Trash2 size={14} /></button>
          </>
        ) : undefined}
      />

      {modal && (
        <Modal title={modal === 'add' ? 'Add Employee' : 'Edit Employee'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-row">
              <label>
                Emp ID
                <input
                  value={form.id}
                  onChange={e => setForm({ ...form, id: e.target.value })}
                  placeholder="Auto-generated"
                  readOnly={modal === 'add'}
                  className={modal === 'add' ? 'input-readonly' : ''}
                />
              </label>
              {formFields[0] && renderFormField(formFields[0])}
            </div>
            {formRows.slice(1).map((pair, i) => (
              <div className="form-row" key={i}>
                {pair.map(f => renderFormField(f))}
              </div>
            ))}
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
