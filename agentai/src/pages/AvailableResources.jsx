import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { Calendar, UserCheck, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatDate } from '../utils/dateUtils';

// Generate daily/weekly check dates between two dates for availability calculation
function getCheckDates(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end - start) / (1000 * 60 * 60 * 24);

  // Use weekly intervals for ranges > 60 days, otherwise daily
  const step = diffDays > 60 ? 7 : 1;
  const d = new Date(start);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + step);
  }
  // Always include end date
  const endStr = end.toISOString().slice(0, 10);
  if (dates[dates.length - 1] !== endStr) dates.push(endStr);
  return dates;
}

export default function AvailableResources() {
  const { state } = useAppContext();
  const { isAdmin } = useAuth();
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultEndStr = (() => { const d = new Date(todayStr + 'T00:00:00'); d.setDate(d.getDate() + 29); return d.toISOString().slice(0, 10); })();
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(defaultEndStr);
  const [search, setSearch] = useState('');
  const [filterSubBand, setFilterSubBand] = useState('');
  const [filterRoleName, setFilterRoleName] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterPod, setFilterPod] = useState('');

  const ccMap = useMemo(() => Object.fromEntries(state.costCodes.map(c => [c.id, c])), [state.costCodes]);
  const subBands = useMemo(() => [...new Set(state.employees.map(e => e.subBand).filter(Boolean))].sort(), [state.employees]);
  const roleNames = useMemo(() => [...new Set(state.employees.map(e => e.roleName).filter(Boolean))].sort(), [state.employees]);
  const countries = useMemo(() => [...new Set(state.employees.map(e => e.country).filter(Boolean))].sort(), [state.employees]);
  const classifications = useMemo(() => [...new Set(state.employees.map(e => e.classification).filter(Boolean))].sort(), [state.employees]);
  const pods = useMemo(() => [...new Set(state.employees.map(e => e.pod).filter(Boolean))].sort(), [state.employees]);

  const availableResources = useMemo(() => {
    const results = [];

    state.employees.forEach(emp => {
      // Get all allocations for this employee that overlap with the date range
      const empAllocations = state.allocations.filter(
        a => a.employeeId === emp.id && a.startDate <= endDate && a.endDate >= startDate
      );

      // Check each date in the range to find availability windows
      const checkDates = getCheckDates(startDate, endDate);
      let currentWindow = null;

      checkDates.forEach((date, idx) => {
        const activeAllocsOnDate = empAllocations.filter(
          a => a.startDate <= date && a.endDate >= date
        );
        const totalPct = activeAllocsOnDate.reduce((s, a) => s + a.percentage, 0);
        const available = 100 - totalPct;

        if (available > 0) {
          if (!currentWindow || currentWindow.availablePct !== available) {
            // Start new window
            if (currentWindow) results.push(currentWindow);
            currentWindow = {
              employeeId: emp.id,
              employeeName: emp.name,
              subBand: emp.subBand || '-',
              roleName: emp.roleName || '-',
              country: emp.country || '-',
              classification: emp.classification || '-',
              pod: emp.pod || '-',
              startDate: date,
              endDate: date,
              availablePct: available,
              totalAllocated: totalPct,
              allocations: activeAllocsOnDate.map(a => {
                const cc = state.costCodes.find(c => c.id === a.costCodeId);
                return `${cc?.code || '?'}: ${a.percentage}%`;
              }),
            };
          } else {
            // Extend current window
            currentWindow.endDate = date;
          }
        } else {
          if (currentWindow) {
            results.push(currentWindow);
            currentWindow = null;
          }
        }
      });

      // Push last window
      if (currentWindow) results.push(currentWindow);
    });

    // Sort by availability (most available first)
    results.sort((a, b) => b.availablePct - a.availablePct);
    return results;
  }, [state.employees, state.allocations, state.costCodes, startDate, endDate]);

  const filtered = useMemo(() => {
    let result = availableResources;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.employeeName.toLowerCase().includes(q) ||
        r.roleName.toLowerCase().includes(q) ||
        r.subBand.toLowerCase().includes(q) ||
        r.country.toLowerCase().includes(q) ||
        r.classification.toLowerCase().includes(q) ||
        r.pod.toLowerCase().includes(q)
      );
    }
    if (filterSubBand) result = result.filter(r => r.subBand === filterSubBand);
    if (filterRoleName) result = result.filter(r => r.roleName === filterRoleName);
    if (filterCountry) result = result.filter(r => r.country === filterCountry);
    if (filterClassification) result = result.filter(r => r.classification === filterClassification);
    if (filterPod) result = result.filter(r => r.pod === filterPod);
    return result;
  }, [availableResources, search, filterSubBand, filterRoleName, filterCountry, filterClassification, filterPod]);

  const uniqueEmployees = new Set(filtered.map(r => r.employeeId)).size;

  const resSchema = state.schemas?.availableResources?.fields || [];

  // Render map for all known column keys
  const columnRenderers = useMemo(() => ({
    employeeName: {
      label: 'Employee',
      render: (row) => <strong>{row.employeeName}</strong>,
    },
    employeeId: {
      label: 'Employee ID',
      render: (row) => <span className="text-muted">{row.employeeId}</span>,
    },
    subBand: { label: 'Sub Band' },
    roleName: { label: 'Role Name' },
    country: { label: 'Country' },
    classification: { label: 'Classification' },
    pod: { label: 'POD' },
    startDate: { label: 'Available From', render: (row) => formatDate(row.startDate) },
    endDate: { label: 'Available To', render: (row) => formatDate(row.endDate) },
    availablePct: {
      label: 'Available %',
      render: (row) => (
        <span className={`badge ${row.availablePct >= 50 ? 'badge-success' : 'badge-warning'}`}>
          {row.availablePct}%
        </span>
      ),
    },
    totalAllocated: {
      label: 'Currently Allocated',
      render: (row) => <StatusBadge percentage={row.totalAllocated} />,
    },
    allocations: {
      label: 'Current Assignments',
      sortable: false,
      render: (row) => (
        <div className="alloc-chips">
          {row.allocations.length === 0 ? (
            <span className="text-muted">No assignments</span>
          ) : (
            row.allocations.map((a, j) => (
              <span key={j} className="alloc-chip chip-approved">{a}</span>
            ))
          )}
        </div>
      ),
    },
  }), []);

  // Build columns from schema, respecting visible toggle
  const resourceColumns = useMemo(() => {
    return resSchema
      .filter(f => f.visible !== false)
      .map(f => {
        const renderer = columnRenderers[f.key];
        if (renderer) {
          return { key: f.key, label: renderer.label || f.label, ...renderer };
        }
        // Custom field — render directly from row data
        return { key: f.key, label: f.label, render: (row) => row[f.key] ?? '-' };
      });
  }, [resSchema, columnRenderers]);

  function handleExport() {
    const wb = XLSX.utils.book_new();
    const data = filtered.map(r => ({
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Sub Band': r.subBand,
      'Role Name': r.roleName,
      'Country': r.country,
      'Classification': r.classification,
      'POD': r.pod,
      'Available From': r.startDate,
      'Available To': r.endDate,
      'Available %': r.availablePct,
      'Currently Allocated %': r.totalAllocated,
      'Current Assignments': r.allocations.join(', ') || 'None',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Available Resources');
    XLSX.writeFile(wb, `available_resources_${startDate}_to_${endDate}.xlsx`);
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1>Available Resources</h1>
        </div>
        <div className="header-actions">
          {isAdmin && (
            <button className="btn" onClick={handleExport} disabled={filtered.length === 0}>
              <Download size={15} /> Export
            </button>
          )}
          <div className="date-range-picker">
            <Calendar size={16} />
            <label>
              From
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </label>
            <span className="range-sep">-</span>
            <label>
              To
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <label className="filter-item">
          <span>Sub Band</span>
          <select value={filterSubBand} onChange={e => setFilterSubBand(e.target.value)}>
            <option value="">All Sub Bands</option>
            {subBands.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="filter-item">
          <span>Role Name</span>
          <select value={filterRoleName} onChange={e => setFilterRoleName(e.target.value)}>
            <option value="">All Roles</option>
            {roleNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="filter-item">
          <span>Country</span>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}>
            <option value="">All Countries</option>
            {countries.map(d => <option key={d} value={d}>{d}</option>)}
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
        {(filterSubBand || filterRoleName || filterCountry || filterClassification || filterPod) && (
          <button className="btn btn-sm" onClick={() => { setFilterSubBand(''); setFilterRoleName(''); setFilterCountry(''); setFilterClassification(''); setFilterPod(''); }}>
            Clear Filters
          </button>
        )}
      </div>

      <DataTable
        columns={resourceColumns}
        data={filtered}
        searchPlaceholder="Search by name, role, sub band, country, classification, pod..."
      />
    </div>
  );
}
