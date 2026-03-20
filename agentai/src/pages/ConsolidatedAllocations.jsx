import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Download, ChevronDown, ChevronRight, Send } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';
import { buildConsolidatedData } from '../utils/allocationUtils';
import { submissionsApi } from '../services/api';
import * as XLSX from 'xlsx';

function getDefaultEndDate(startDate) {
  const d = new Date(startDate + 'T00:00:00');
  d.setDate(d.getDate() + 29); // 30-day inclusive range (day 0 through day 29)
  return d.toISOString().slice(0, 10);
}

export default function ConsolidatedAllocations() {
  const { state } = useAppContext();
  const { user, isAdmin } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [benchEnabled, setBenchEnabled] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = getDefaultEndDate(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterJobFunction, setFilterJobFunction] = useState('');
  const [filterSubBand, setFilterSubBand] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterPod, setFilterPod] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const empMap = useMemo(() => Object.fromEntries(state.employees.map(e => [e.id, e])), [state.employees]);
  const ccMap = useMemo(() => Object.fromEntries(state.costCodes.map(c => [c.id, c])), [state.costCodes]);

  // Bench cost code setting
  const benchCostCodeId = state.lookups?.['bench-cost-code']?.[0] || null;
  const benchCostCode = benchCostCodeId && ccMap[benchCostCodeId] ? ccMap[benchCostCodeId] : null;

  const consolidated = useMemo(() => {
    const rangeStart = startDate || today;
    const rangeEnd = endDate || defaultEnd;

    const { consolidated: rawResult } = buildConsolidatedData(
      state.employees, state.allocations, state.costCodes,
      rangeStart, rangeEnd,
      {}, // No employee filters here — we apply them below alongside cost-code filters
      { enabled: benchEnabled, costCodeId: benchCostCodeId, costCode: benchCostCode }
    );

    let result = rawResult;

    if (filterEmployee) {
      const q = filterEmployee.toLowerCase();
      result = result.filter(r => (empMap[r.employeeId]?.name || '').toLowerCase().includes(q));
    }
    if (filterJobFunction) {
      result = result.filter(r => empMap[r.employeeId]?.jobFunction === filterJobFunction);
    }
    if (filterSubBand) {
      result = result.filter(r => empMap[r.employeeId]?.subBand === filterSubBand);
    }
    if (filterCountry) {
      result = result.filter(r => empMap[r.employeeId]?.country === filterCountry);
    }
    if (filterClassification) {
      result = result.filter(r => empMap[r.employeeId]?.classification === filterClassification);
    }
    if (filterPod) {
      result = result.filter(r => empMap[r.employeeId]?.pod === filterPod);
    }

    return result.sort((a, b) => {
      const nameA = empMap[a.employeeId]?.name || '';
      const nameB = empMap[b.employeeId]?.name || '';
      return nameA.localeCompare(nameB);
    });
  }, [state.allocations, state.employees, state.costCodes, empMap, filterEmployee, filterJobFunction, filterSubBand, filterCountry, filterClassification, filterPod, startDate, endDate, today, defaultEnd, benchEnabled, benchCostCode, benchCostCodeId, ccMap]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(consolidated.length / rowsPerPage));
  const safeCurrentPage = Math.min(page, totalPages);
  const paginatedData = consolidated.slice((safeCurrentPage - 1) * rowsPerPage, safeCurrentPage * rowsPerPage);

  // Reset page when filters change
  const filterKey = `${filterEmployee}|${filterJobFunction}|${filterSubBand}|${filterCountry}|${filterClassification}|${filterPod}`;
  useMemo(() => { setPage(1); }, [filterKey]);

  const jobFunctions = useMemo(() => [...new Set(state.employees.map(e => e.jobFunction).filter(Boolean))].sort(), [state.employees]);
  const subBands = useMemo(() => [...new Set(state.employees.map(e => e.subBand).filter(Boolean))].sort(), [state.employees]);
  const countries = useMemo(() => [...new Set(state.employees.map(e => e.country).filter(Boolean))].sort(), [state.employees]);
  const classifications = useMemo(() => [...new Set(state.employees.map(e => e.classification).filter(Boolean))].sort(), [state.employees]);
  const pods = useMemo(() => [...new Set(state.employees.map(e => e.pod).filter(Boolean))].sort(), [state.employees]);

  // Summary stats
  const stats = useMemo(() => {
    const fullyAllocated = consolidated.filter(r => r.totalAllocated === 100).length;
    const overAllocated = consolidated.filter(r => r.totalAllocated > 100).length;
    const underAllocated = consolidated.filter(r => r.totalAllocated > 0 && r.totalAllocated < 100).length;
    const unallocated = consolidated.filter(r => r.totalAllocated === 0).length;
    return { fullyAllocated, overAllocated, underAllocated, unallocated };
  }, [consolidated]);

  function toggleRow(employeeId) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function getBadgeClass(pct) {
    if (pct > 100) return 'badge-danger';
    if (pct === 100) return 'badge-success';
    if (pct > 0) return 'badge-warning';
    return 'badge-neutral';
  }

  function handleExport() {
    // Sheet 1: Consolidated summary per employee
    const summaryRows = [];
    consolidated.forEach(row => {
      const emp = empMap[row.employeeId];
      const rowSgus = [...new Set(row.allocations.map(a => ccMap[a.costCodeId]?.sgu).filter(Boolean))].join(', ') || '-';
      const rowImus = [...new Set(row.allocations.map(a => ccMap[a.costCodeId]?.imu).filter(Boolean))].join(', ') || '-';
      summaryRows.push({
        'Employee ID': row.employeeId,
        'Employee Name': emp?.name || 'Unknown',
        'Sub Band': emp?.subBand || '-',
        'Job Function': emp?.jobFunction || '-',
        'Classification': emp?.classification || '-',
        'POD': emp?.pod || '-',
        'SGU': rowSgus,
        'IMU': rowImus,
        'Country': emp?.country || '-',
        'Utilization %': row.totalAllocated,
        'Unallocated %': row.unallocated,
        'Range Start': startDate || today,
        'Range End': endDate || defaultEnd,
        'Total Days': row.totalDays,
        'No. of Approved Allocations': row.allocations.length,
      });
    });

    // Sheet 2: Detailed allocation entries
    const detailRows = [];
    consolidated.forEach(row => {
      const emp = empMap[row.employeeId];
      row.allocations.forEach(a => {
        const cc = ccMap[a.costCodeId];
        detailRows.push({
          'Employee ID': row.employeeId,
          'Employee Name': emp?.name || 'Unknown',
          'SGU': cc?.sgu || '-',
          'IMU': cc?.imu || '-',
          'Job Function': emp?.jobFunction || '-',
          'Cost Code': cc?.code || 'Unknown',
          'Project Name': cc?.name || '-',
          'Category': cc?.category || '-',
          'Client Name': cc?.clientName || '-',
          'Approver': cc?.approver || '-',
          'SPOC': cc?.spoc || '-',
          'Allocation %': a.percentage,
          'Start Date': a.startDate,
          'End Date': a.endDate,
          'Type': a.isBench ? 'Bench' : 'Approved',
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Consolidated');
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Allocation Details');
    XLSX.writeFile(wb, `Consolidated_Allocations_${startDate}_to_${endDate}.xlsx`);
  }

  function buildSnapshotData() {
    const summarySnapshot = [];
    const detailSnapshot = [];
    consolidated.forEach(row => {
      const emp = empMap[row.employeeId];
      const snapSgus = [...new Set(row.allocations.map(a => ccMap[a.costCodeId]?.sgu).filter(Boolean))].join(', ') || '-';
      const snapImus = [...new Set(row.allocations.map(a => ccMap[a.costCodeId]?.imu).filter(Boolean))].join(', ') || '-';
      summarySnapshot.push({
        'Employee ID': row.employeeId,
        'Employee Name': emp?.name || 'Unknown',
        'Sub Band': emp?.subBand || '-',
        'Job Function': emp?.jobFunction || '-',
        'Classification': emp?.classification || '-',
        'SGU': snapSgus,
        'IMU': snapImus,
        'Country': emp?.country || '-',
        'Utilization %': row.totalAllocated,
        'Unallocated %': row.unallocated,
        'Range Start': startDate || today,
        'Range End': endDate || defaultEnd,
        'Total Days': row.totalDays,
        'No. of Approved Allocations': row.allocations.length,
      });
      row.allocations.forEach(a => {
        const cc = ccMap[a.costCodeId];
        detailSnapshot.push({
          'Employee ID': row.employeeId,
          'Employee Name': emp?.name || 'Unknown',
          'SGU': cc?.sgu || '-',
          'IMU': cc?.imu || '-',
          'Job Function': emp?.jobFunction || '-',
          'Cost Code': cc?.code || 'Unknown',
          'Project Name': cc?.name || '-',
          'Category': cc?.category || '-',
          'Client Name': cc?.clientName || '-',
          'Approver': cc?.approver || '-',
          'SPOC': cc?.spoc || '-',
          'Allocation %': a.percentage,
          'Start Date': a.startDate,
          'End Date': a.endDate,
          'Type': a.isBench ? 'Bench' : 'Approved',
        });
      });
    });
    return { summarySnapshot, detailSnapshot };
  }

  async function handleSubmitToRMG() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { summarySnapshot, detailSnapshot } = buildSnapshotData();
      const submission = await submissionsApi.create({
        submittedBy: user?.displayName || user?.role || 'Admin',
        startDate: startDate || today,
        endDate: endDate || defaultEnd,
        filters: { employee: filterEmployee || 'All', jobFunction: filterJobFunction || 'All', benchEnabled: benchEnabled && !!benchCostCode },
        employeeCount: consolidated.length,
        stats,
        summarySnapshot,
        detailSnapshot,
      });

      // Download the Excel from snapshot
      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summarySnapshot);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Consolidated');
      const wsDetail = XLSX.utils.json_to_sheet(detailSnapshot);
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Allocation Details');
      XLSX.writeFile(wb, `RMG_Submission_${startDate}_to_${endDate}_${submission.submittedAt.slice(0, 10)}.xlsx`);

      alert('Submitted to RMG successfully! Excel file downloaded.');
    } catch (err) {
      alert('Failed to submit: ' + err.message);
    }
    setSubmitting(false);
  }

  const columns = [
    {
      key: 'expand',
      label: '',
      render: (row) => row.allocations.length > 0 ? (
        <button
          className="btn-icon"
          onClick={(e) => { e.stopPropagation(); toggleRow(row.employeeId); }}
          title="Expand details"
          style={{ padding: '2px' }}
        >
          {expandedRows.has(row.employeeId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : null,
    },
    {
      key: 'employeeName',
      label: 'Employee',
      render: (row) => empMap[row.employeeId]?.name || 'Unknown',
    },
    {
      key: 'employeeId',
      label: 'Employee ID',
      render: (row) => <span className="text-muted">{row.employeeId}</span>,
    },
    {
      key: 'subBand',
      label: 'Sub Band',
      render: (row) => empMap[row.employeeId]?.subBand || '-',
    },
    {
      key: 'classification',
      label: 'Classification',
      render: (row) => empMap[row.employeeId]?.classification || '-',
    },
    {
      key: 'pod',
      label: 'POD',
      render: (row) => empMap[row.employeeId]?.pod || '-',
    },
    {
      key: 'totalAllocated',
      label: 'Utilization %',
      render: (row) => (
        <span className={`badge ${getBadgeClass(row.totalAllocated)}`}>
          {row.totalAllocated}%
        </span>
      ),
    },
    {
      key: 'unallocated',
      label: 'Unallocated %',
      render: (row) => (
        <span className={`badge ${row.unallocated > 0 ? 'badge-danger' : 'badge-success'}`}>
          {row.unallocated}%
        </span>
      ),
    },
    {
      key: 'allocationCount',
      label: 'Entries',
      render: (row) => row.allocations.length,
    },
  ];

  function renderExpandedRow(row) {
    if (!expandedRows.has(row.employeeId) || row.allocations.length === 0) return null;
    return (
      <tr key={`${row.employeeId}-detail`} className="expanded-detail-row">
        <td colSpan={columns.length + 1} style={{ padding: 0 }}>
          <div className="expanded-detail-content">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Cost Code</th>
                  <th>Project Name</th>
                  <th>Category</th>
                  <th>Client Name</th>
                  <th>Approver</th>
                  <th>SPOC</th>
                  <th>SGU</th>
                  <th>IMU</th>
                  <th>Allocation %</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                </tr>
              </thead>
              <tbody>
                {row.allocations.map(a => {
                  const cc = ccMap[a.costCodeId];
                  return (
                    <tr key={a.id} className={a.isBench ? 'bench-allocation-row' : ''}>
                      <td>
                        {cc ? cc.code : 'Unknown'}
                        {a.isBench && <span className="badge badge-bench" style={{ marginLeft: 6 }}>BENCH</span>}
                      </td>
                      <td>{cc ? cc.name : '-'}</td>
                      <td>{cc?.category ? <span className="badge badge-neutral">{cc.category}</span> : '-'}</td>
                      <td>{cc?.clientName || '-'}</td>
                      <td>{cc?.approver || '-'}</td>
                      <td>{cc?.spoc || '-'}</td>
                      <td>{cc?.sgu || '-'}</td>
                      <td>{cc?.imu || '-'}</td>
                      <td><span className={`badge ${a.isBench ? 'badge-bench' : 'badge-success'}`}>{a.percentage}%</span></td>
                      <td>{formatDate(a.startDate)}</td>
                      <td>{formatDate(a.endDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Consolidated Allocations</h1>
          <p className="text-muted" style={{ margin: '4px 0 0' }}>
            Approved allocations · <strong>{formatDate(startDate || today)}</strong> to <strong>{formatDate(endDate || defaultEnd)}</strong> · {consolidated.length} employees
            {stats.fullyAllocated > 0 && <span> · <span style={{ color: 'var(--success)' }}>{stats.fullyAllocated} at 100%</span></span>}
            {stats.overAllocated > 0 && <span> · <span style={{ color: 'var(--danger)' }}>{stats.overAllocated} over-allocated</span></span>}
            {stats.underAllocated > 0 && <span> · <span style={{ color: 'var(--warning)' }}>{stats.underAllocated} under-allocated</span></span>}
            {stats.unallocated > 0 && <span> · <span className="text-muted">{stats.unallocated} unallocated</span></span>}
          </p>
        </div>
        {isAdmin && (
          <div className="header-actions" style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={handleExport}>
              <Download size={15} /> Export
            </button>
            <button className="btn btn-primary" onClick={handleSubmitToRMG} disabled={submitting}>
              <Send size={15} /> {submitting ? 'Submitting...' : 'Submit to RMG'}
            </button>
          </div>
        )}
      </div>

      <div className="filters-bar">
        <label className="filter-item">
          <span>Start Date</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label className="filter-item">
          <span>End Date</span>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
        </label>
        <label className="filter-item">
          <span>Employee</span>
          <input type="text" placeholder="Search employee..." value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} style={{ minWidth: 140 }} />
        </label>
        <label className="filter-item">
          <span>Job Function</span>
          <select value={filterJobFunction} onChange={e => setFilterJobFunction(e.target.value)}>
            <option value="">All Job Functions</option>
            {jobFunctions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="filter-item">
          <span>Sub Band</span>
          <select value={filterSubBand} onChange={e => setFilterSubBand(e.target.value)}>
            <option value="">All Sub Bands</option>
            {subBands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="filter-item">
          <span>Country</span>
          <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
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
        {benchCostCode && (
          <label className="filter-item bench-toggle-item" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span>Include Bench</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={benchEnabled} onChange={e => setBenchEnabled(e.target.checked)} />
              <span className="toggle-slider"></span>
            </label>
            {benchEnabled && <span className="badge badge-bench" style={{ fontSize: '0.7rem' }}>{benchCostCode.code}</span>}
          </label>
        )}
        {(filterEmployee || filterJobFunction || filterSubBand || filterCountry || filterClassification || filterPod || startDate !== today || endDate !== defaultEnd) && (
          <button className="btn btn-sm" onClick={() => { setFilterEmployee(''); setFilterJobFunction(''); setFilterSubBand(''); setFilterCountry(''); setFilterClassification(''); setFilterPod(''); setStartDate(today); setEndDate(defaultEnd); }}>
            Clear Filters
          </button>
        )}
      </div>

      <div className="consolidated-table-wrapper">
        <table className="data-table consolidated-data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr><td colSpan={columns.length} className="empty-state">No employees found.</td></tr>
            ) : (
              paginatedData.map(row => (
                <>
                  <tr key={row.employeeId} className={`consolidated-row ${row.allocations.length > 0 ? '' : 'text-muted'}`} onClick={() => row.allocations.length > 0 && toggleRow(row.employeeId)} style={{ cursor: row.allocations.length > 0 ? 'pointer' : 'default' }}>
                    {columns.map(col => (
                      <td key={col.key}>{col.render(row)}</td>
                    ))}
                  </tr>
                  {renderExpandedRow(row)}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="pagination-bar">
        <div className="pagination-rows">
          Rows: <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="pagination-controls">
          <button disabled={safeCurrentPage <= 1} onClick={() => setPage(1)}>&laquo;</button>
          <button disabled={safeCurrentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>&lsaquo;</button>
          <span>Page {safeCurrentPage} of {totalPages}</span>
          <button disabled={safeCurrentPage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>&rsaquo;</button>
          <button disabled={safeCurrentPage >= totalPages} onClick={() => setPage(totalPages)}>&raquo;</button>
        </div>
      </div>
    </div>
  );
}
