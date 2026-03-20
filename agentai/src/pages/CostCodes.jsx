import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { Plus, Edit2, Trash2, Lock } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';
import ExcelUpload from '../components/ExcelUpload';
import { v4 as uuidv4 } from 'uuid';

export default function CostCodes() {
  const { state, dispatch } = useAppContext();
  const { isAdmin } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [filters, setFilters] = useState({});
  const [filterCostCodeText, setFilterCostCodeText] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const schema = state.schemas?.costCodes;
  const schemaFields = schema?.fields || [];

  // Build empty form from schema
  const emptyForm = useMemo(() => {
    const obj = {};
    schemaFields.forEach(f => { obj[f.key] = ''; });
    return obj;
  }, [schemaFields]);

  // Get dropdown options for a field
  function getDropdownOptions(field) {
    if (field.lookupCategory) {
      return state.lookups?.[field.lookupCategory] || [];
    }
    if (field.dropdownOptions) return field.dropdownOptions;
    return [...new Set(state.costCodes.map(c => c[field.key]).filter(Boolean))].sort();
  }

  function withCurrent(options, currentVal) {
    if (!currentVal || options.includes(currentVal)) return options;
    return [...options, currentVal].sort();
  }

  // Filterable fields
  const filterableFields = useMemo(() =>
    schemaFields.filter(f => f.visible && f.type === 'dropdown' && f.key !== 'id'),
    [schemaFields]
  );

  const filterOptions = useMemo(() => {
    const opts = {};
    filterableFields.forEach(f => {
      if (f.key === 'approver' || f.key === 'spoc') {
        opts[f.key] = [...new Set(state.costCodes.map(c => c[f.key]).filter(Boolean))].sort();
      } else {
        opts[f.key] = getDropdownOptions(f);
      }
    });
    return opts;
  }, [filterableFields, state.costCodes, state.lookups]);

  const costCodesWithCounts = useMemo(() => {
    return state.costCodes.map(cc => {
      const empCount = new Set(state.allocations.filter(a => a.costCodeId === cc.id).map(a => a.employeeId)).size;
      const totalPct = state.allocations.filter(a => a.costCodeId === cc.id).reduce((s, a) => s + a.percentage, 0);
      return { ...cc, employeeCount: empCount, totalAllocation: totalPct };
    });
  }, [state.costCodes, state.allocations]);

  const filteredCostCodes = useMemo(() => {
    let result = costCodesWithCounts;
    Object.entries(filters).forEach(([key, val]) => {
      if (val) result = result.filter(c => c[key] === val);
    });
    if (filterCostCodeText) {
      const q = filterCostCodeText.toLowerCase();
      result = result.filter(c => (c.code || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q));
    }
    return result;
  }, [costCodesWithCounts, filters, filterCostCodeText]);

  // Build columns from schema
  const columns = useMemo(() => {
    const renderOverrides = {
      category: (row) => row.category ? <span className="badge badge-neutral">{row.category}</span> : <span className="text-muted">-</span>,
      clientName: (row) => row.clientName || <span className="text-muted">-</span>,
      startDate: (row) => formatDate(row.startDate),
      expiryDate: (row) => {
        const today = new Date().toISOString().slice(0, 10);
        const expired = row.expiryDate && row.expiryDate < today;
        return row.expiryDate ? <span className={expired ? 'text-danger' : ''}>{formatDate(row.expiryDate)}</span> : <span className="text-muted">-</span>;
      },
      approver: (row) => row.approver || <span className="text-muted">-</span>,
      spoc: (row) => row.spoc || <span className="text-muted">-</span>,
      sgu: (row) => row.sgu || <span className="text-muted">-</span>,
      imu: (row) => row.imu || <span className="text-muted">-</span>,
    };

    const cols = schemaFields
      .filter(f => f.visible)
      .map(f => ({
        key: f.key,
        label: f.label,
        render: renderOverrides[f.key] || (f.type === 'date' ? (row) => formatDate(row[f.key]) : undefined),
      }));

    // Always add status column at end
    cols.push({
      key: 'status',
      label: 'Status',
      render: (row) => {
        const today = new Date().toISOString().slice(0, 10);
        if (!row.startDate || !row.expiryDate) return <span className="badge badge-neutral">No Dates</span>;
        if (row.expiryDate < today) return <span className="badge badge-danger">Expired</span>;
        if (row.startDate > today) return <span className="badge badge-warning">Upcoming</span>;
        return <span className="badge badge-success">Active</span>;
      },
    });

    return cols;
  }, [schemaFields]);

  // Excel template from schema
  const templateHeaders = useMemo(() =>
    ['ID', ...schemaFields.filter(f => f.visible && f.excelHeader).map(f => f.excelHeader)],
    [schemaFields]
  );

  const templateSample = useMemo(() =>
    ['cc-1', ...schemaFields.filter(f => f.visible && f.excelHeader).map(f => {
      if (f.type === 'date') return '2025-01-01';
      if (f.type === 'dropdown') {
        const opts = getDropdownOptions(f);
        return opts[0] || '';
      }
      return f.label;
    })],
    [schemaFields]
  );

  const requiredExcelFields = useMemo(() =>
    schemaFields.filter(f => f.visible && f.required && f.excelHeader).map(f => f.excelHeader),
    [schemaFields]
  );

  function parseRow(r) {
    const item = { id: r.ID || r.id || uuidv4() };
    schemaFields.forEach(f => {
      const val = r[f.excelHeader];
      item[f.key] = val ? String(val).trim() : '';
    });
    return item;
  }

  function openAdd() { setForm(emptyForm); setModal('add'); }
  function openEdit(cc) {
    const f = {};
    schemaFields.forEach(field => { f[field.key] = cc[field.key] || ''; });
    setEditId(cc.id);
    setForm(f);
    setModal('edit');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (modal === 'add') {
      dispatch({ type: 'ADD_COST_CODE', payload: form });
    } else {
      dispatch({ type: 'UPDATE_COST_CODE', payload: { id: editId, ...form } });
    }
    setModal(null);
  }

  function handleDelete(id) {
    if (confirm('Delete this cost code and all related allocations?')) {
      dispatch({ type: 'DELETE_COST_CODE', payload: id });
    }
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} selected cost code(s) and all their allocations? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await dispatch({ type: 'BULK_DELETE_COST_CODES', payload: [...selectedIds] });
      setSelectedIds(new Set());
    } catch (err) {
      alert('Bulk delete failed: ' + err.message);
    } finally {
      setDeleting(false);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean) || filterCostCodeText !== '';

  // Render form field based on schema
  function renderFormField(field) {
    if (field.type === 'employeeName') {
      return (
        <label key={field.key}>
          {field.label}{field.required ? ' *' : ''}
          <select required={field.required} value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })}>
            <option value="">Select {field.label}...</option>
            {state.employees.map(emp => (
              <option key={emp.id} value={emp.name}>{emp.name}</option>
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

    return (
      <label key={field.key}>
        {field.label}{field.required ? ' *' : ''}
        <input required={field.required} value={form[field.key] || ''} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder={`e.g. ${field.label}`} />
      </label>
    );
  }

  const formFields = schemaFields;
  const formRows = [];
  for (let i = 0; i < formFields.length; i += 2) {
    formRows.push(formFields.slice(i, i + 2));
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Cost Codes</h1>
          {!isAdmin && <div className="role-notice"><Lock size={13} /> Read-only. Only admins can manage cost codes.</div>}
        </div>
        {isAdmin && (
          <div className="header-actions">
            <ExcelUpload
              label="Cost Codes"
              sheetName="Cost Codes"
              headers={templateHeaders}
              sampleRow={templateSample}
              requiredFields={requiredExcelFields}
              parseRow={parseRow}
              onImport={(data) => dispatch({ type: 'IMPORT_DATA', payload: { costCodes: data } })}
            />
            {selectedIds.size > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={deleting}>
                <Trash2 size={14} /> Delete {selectedIds.size} Selected
              </button>
            )}
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus size={14} /> Add Cost Code
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
        <label className="filter-item">
          <span>Cost Code</span>
          <input type="text" placeholder="Search code or name..." value={filterCostCodeText} onChange={e => setFilterCostCodeText(e.target.value)} />
        </label>
        {hasFilters && (
          <button className="btn btn-sm" onClick={() => { setFilters({}); setFilterCostCodeText(''); }}>
            Clear Filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredCostCodes}
        searchPlaceholder="Search cost codes..."
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
        <Modal title={modal === 'add' ? 'Add Cost Code' : 'Edit Cost Code'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit} className="form">
            {formRows.map((pair, i) => (
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
