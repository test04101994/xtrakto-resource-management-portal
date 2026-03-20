import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { exportDashboardReport } from '../utils/excelUtils';
import { buildConsolidatedData } from '../utils/allocationUtils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts';
import { Users, Hash, GitBranch, AlertTriangle, Calendar, Download, TrendingUp, CheckCircle, Clock, UserCheck, Shield } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#84cc16', '#f97316'];
const TABS = ['Overview', 'SGU & Sub Band', 'Cost Codes', 'Trends'];

function getMonthlyPoints(startDate, endDate) {
  const points = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    points.push(d.toISOString().slice(0, 10));
    d.setMonth(d.getMonth() + 1);
  }
  return points;
}

function getDefaultEndDate(start) {
  const d = new Date(start + 'T00:00:00');
  d.setDate(d.getDate() + 29); // 30-day inclusive range
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { state } = useAppContext();
  const { user, isAdmin } = useAuth();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(getDefaultEndDate(todayStr));
  const [activeTab, setActiveTab] = useState('Overview');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterPod, setFilterPod] = useState('');
  const empMap = useMemo(() => Object.fromEntries(state.employees.map(e => [e.id, e])), [state.employees]);
  const ccMap = useMemo(() => Object.fromEntries(state.costCodes.map(c => [c.id, c])), [state.costCodes]);

  const classifications = useMemo(() => [...new Set(state.employees.map(e => e.classification).filter(Boolean))].sort(), [state.employees]);
  const pods = useMemo(() => [...new Set(state.employees.map(e => e.pod).filter(Boolean))].sort(), [state.employees]);

  // Bench cost code setting — default ON if a bench cost code is configured
  const benchCostCodeId = state.lookups?.['bench-cost-code']?.[0] || null;
  const benchCostCode = benchCostCodeId && ccMap[benchCostCodeId] ? ccMap[benchCostCodeId] : null;
  const [benchEnabled, setBenchEnabled] = useState(true);

  // ──────── CONSOLIDATED DATA (same logic as Consolidated View) ────────
  // Uses only Approved allocations with weighted overlap-day utilization
  const { consolidated, filteredEmployees } = useMemo(() => {
    const result = buildConsolidatedData(
      state.employees, state.allocations, state.costCodes,
      startDate, endDate,
      { classification: filterClassification, pod: filterPod },
      { enabled: benchEnabled, costCodeId: benchCostCodeId, costCode: benchCostCode }
    );
    return result;
  }, [state.employees, state.allocations, state.costCodes, startDate, endDate, filterClassification, filterPod, benchEnabled, benchCostCodeId, benchCostCode]);

  // Approved allocations overlapping the date range (for cost code & chart breakdowns)
  const approvedAllocations = useMemo(() => {
    let result = state.allocations.filter(a =>
      a.allocationType === 'Approved' && a.startDate <= endDate && a.endDate >= startDate
    );
    if (filterClassification) result = result.filter(a => empMap[a.employeeId]?.classification === filterClassification);
    if (filterPod) result = result.filter(a => empMap[a.employeeId]?.pod === filterPod);
    return result;
  }, [state.allocations, startDate, endDate, filterClassification, filterPod, empMap]);

  // All allocations (for counting forecasted/cancelled in KPIs)
  const allActiveAllocations = useMemo(() => {
    let result = state.allocations.filter(a => a.startDate <= endDate && a.endDate >= startDate);
    if (filterClassification) result = result.filter(a => empMap[a.employeeId]?.classification === filterClassification);
    if (filterPod) result = result.filter(a => empMap[a.employeeId]?.pod === filterPod);
    return result;
  }, [state.allocations, startDate, endDate, filterClassification, filterPod, empMap]);

  const costCodeBreakdown = useMemo(() => {
    return state.costCodes.map(cc => {
      const ccAllocs = approvedAllocations.filter(a => a.costCodeId === cc.id);
      return {
        ...cc,
        employeeCount: new Set(ccAllocs.map(a => a.employeeId)).size,
        totalPercentage: ccAllocs.reduce((s, a) => s + a.percentage, 0),
        approvedPct: ccAllocs.reduce((s, a) => s + a.percentage, 0),
      };
    }).filter(cc => cc.employeeCount > 0)
      .sort((a, b) => b.totalPercentage - a.totalPercentage);
  }, [state.costCodes, approvedAllocations]);

  // ──────── KPIs (derived from consolidated data) ────────
  const stats = useMemo(() => {
    const fullyAllocated = consolidated.filter(r => r.totalAllocated === 100).length;
    const overAllocated = consolidated.filter(r => r.totalAllocated > 100).length;
    const underAllocated = consolidated.filter(r => r.totalAllocated > 0 && r.totalAllocated < 100).length;
    const unallocated = consolidated.filter(r => r.totalAllocated === 0).length;
    const activeEmployees = consolidated.filter(r => r.totalAllocated > 0).length;

    const approvedCount = allActiveAllocations.filter(a => a.allocationType === 'Approved').length;
    const forecastedCount = allActiveAllocations.filter(a => (a.allocationType || 'Forecasted') === 'Forecasted').length;

    const totalUtilization = consolidated.reduce((s, r) => s + r.totalAllocated, 0);
    const avgUtilization = consolidated.length > 0 ? Math.round(totalUtilization / consolidated.length) : 0;

    const totalCapacity = consolidated.length * 100;
    const totalAllocPct = totalUtilization;

    return {
      totalEmployees: filteredEmployees.length,
      activeEmployees,
      totalCostCodes: state.costCodes.length,
      activeCostCodes: costCodeBreakdown.length,
      totalAllocations: approvedCount,
      fullyAllocated, overAllocated, underAllocated, unallocated,
      approvedCount, forecastedCount,
      avgUtilization,
      totalCapacity,
      totalAllocPct,
      totalUnallocPct: Math.max(0, totalCapacity - totalAllocPct),
      coreCount: filteredEmployees.filter(e => e.classification === 'Core').length,
      nonCoreCount: filteredEmployees.filter(e => e.classification === 'Non-Core').length,
    };
  }, [consolidated, filteredEmployees, state.costCodes, costCodeBreakdown, allActiveAllocations]);

  const capacityDonutData = useMemo(() => {
    const total = stats.totalCapacity || 1;
    const allocPct = Math.round(stats.totalAllocPct / total * 100);
    const unallocPct = 100 - allocPct;
    return [
      { name: 'Allocated', value: allocPct },
      { name: 'Unallocated', value: unallocPct },
    ].filter(d => d.value > 0);
  }, [stats]);

  // ──────── CHART DATA ────────

  const sguAllocationData = useMemo(() => {
    const sguMap = {};
    approvedAllocations.forEach(a => {
      const cc = ccMap[a.costCodeId];
      const sgu = cc?.sgu || 'Other';
      if (!sguMap[sgu]) sguMap[sgu] = { sgu, employees: new Set() };
      sguMap[sgu].employees.add(a.employeeId);
    });
    return Object.values(sguMap)
      .map(d => ({ sgu: d.sgu, Employees: d.employees.size }))
      .sort((a, b) => b.Employees - a.Employees);
  }, [approvedAllocations, ccMap]);

  const categoryPieData = useMemo(() => {
    const catMap = {};
    approvedAllocations.forEach(a => {
      const cc = ccMap[a.costCodeId];
      const cat = cc?.category || 'Other';
      catMap[cat] = (catMap[cat] || 0) + a.percentage;
    });
    const totalRaw = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(catMap).map(([name, value]) => ({ name, value: Math.round(value / totalRaw * 100) })).sort((a, b) => b.value - a.value);
  }, [approvedAllocations, ccMap]);

  const trendData = useMemo(() => {
    const months = getMonthlyPoints(startDate, endDate);
    return months.map(month => {
      // Only Approved allocations for trend consistency
      const monthAllocs = state.allocations.filter(a =>
        a.allocationType === 'Approved' && a.startDate <= month && a.endDate >= month
      );
      const activeEmps = new Set(monthAllocs.map(a => a.employeeId)).size;
      const totalPct = monthAllocs.reduce((s, a) => s + a.percentage, 0);
      const avgUtil = activeEmps > 0 ? Math.round(totalPct / activeEmps) : 0;
      return {
        month: new Date(month).toLocaleDateString('en-US', { month: 'short' }),
        'Avg Utilization': avgUtil,
        'Active Employees': activeEmps,
        'Approved Allocs': monthAllocs.length,
      };
    });
  }, [state.allocations, startDate, endDate]);

  const typeDonutData = useMemo(() => {
    const fullyPct = stats.fullyAllocated;
    const underPct = stats.underAllocated;
    const unallocPct = stats.unallocated;
    const overPct = stats.overAllocated;
    return [
      { name: 'Fully Allocated (100%)', value: fullyPct },
      { name: 'Under-Allocated (<100%)', value: underPct },
      { name: 'Unallocated (0%)', value: unallocPct },
      ...(overPct > 0 ? [{ name: 'Over-Allocated (>100%)', value: overPct }] : []),
    ].filter(d => d.value > 0);
  }, [stats]);
  const statusColors = ['#10b981', '#f59e0b', '#9ca3af', '#ef4444'];

  const costCodeBarData = useMemo(() =>
    costCodeBreakdown.slice(0, 15).map(cc => ({
      name: cc.code, fullName: `${cc.code} - ${cc.name}`, category: cc.category || 'Other',
      Employees: cc.employeeCount,
    })).sort((a, b) => b.Employees - a.Employees),
    [costCodeBreakdown]
  );

  // Classification utilization data
  const classificationData = useMemo(() => {
    const cMap = {};
    consolidated.forEach(row => {
      const emp = empMap[row.employeeId];
      const cls = emp?.classification || 'Not Specified';
      if (!cMap[cls]) cMap[cls] = { classification: cls, totalUtil: 0, count: 0, fullyAllocated: 0 };
      cMap[cls].count += 1;
      cMap[cls].totalUtil += row.totalAllocated;
      if (row.totalAllocated === 100) cMap[cls].fullyAllocated += 1;
    });
    return Object.values(cMap).map(d => ({
      classification: d.classification,
      'Avg Utilization': d.count > 0 ? Math.round(d.totalUtil / d.count) : 0,
      Headcount: d.count,
      'Fully Allocated': d.fullyAllocated,
    })).sort((a, b) => b.Headcount - a.Headcount);
  }, [consolidated, empMap]);

  // POD utilization data
  const podUtilData = useMemo(() => {
    const pMap = {};
    consolidated.forEach(row => {
      const emp = empMap[row.employeeId];
      const pod = emp?.pod || 'Not Specified';
      if (!pMap[pod]) pMap[pod] = { pod, totalUtil: 0, count: 0, fullyAllocated: 0 };
      pMap[pod].count += 1;
      pMap[pod].totalUtil += row.totalAllocated;
      if (row.totalAllocated === 100) pMap[pod].fullyAllocated += 1;
    });
    return Object.values(pMap).map(d => ({
      pod: d.pod,
      'Avg Utilization': d.count > 0 ? Math.round(d.totalUtil / d.count) : 0,
      Headcount: d.count,
      'Fully Allocated': d.fullyAllocated,
    })).sort((a, b) => b.Headcount - a.Headcount);
  }, [consolidated, empMap]);

  // Employee count by POD (pie chart)
  const podCountData = useMemo(() => {
    const pMap = {};
    filteredEmployees.forEach(emp => {
      const pod = emp.pod || 'Not Specified';
      pMap[pod] = (pMap[pod] || 0) + 1;
    });
    return Object.entries(pMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredEmployees]);

  const slabLabels = ['0%', '1-25%', '26-50%', '51-75%', '76-99%', '100%', '>100%'];
  const slabColors = { '0%': '#9ca3af', '1-25%': '#ef4444', '26-50%': '#f59e0b', '51-75%': '#06b6d4', '76-99%': '#8b5cf6', '100%': '#10b981', '>100%': '#dc2626' };
  const sguSlabData = useMemo(() => {
    const slabRanges = [{ label: '0%', min: 0, max: 0 }, { label: '1-25%', min: 1, max: 25 }, { label: '26-50%', min: 26, max: 50 }, { label: '51-75%', min: 51, max: 75 }, { label: '76-99%', min: 76, max: 99 }, { label: '100%', min: 100, max: 100 }, { label: '>100%', min: 101, max: 999 }];
    const sguMap = {};
    consolidated.forEach(row => {
      const empAllocs = row.allocations;
      const empSgus = [...new Set(empAllocs.map(a => ccMap[a.costCodeId]?.sgu).filter(Boolean))];
      if (empSgus.length === 0) empSgus.push('Other');
      empSgus.forEach(sgu => {
        if (!sguMap[sgu]) { sguMap[sgu] = { sgu }; slabRanges.forEach(s => sguMap[sgu][s.label] = 0); }
        const pct = row.totalAllocated;
        const slab = slabRanges.find(s => pct >= s.min && pct <= s.max);
        if (slab) sguMap[sgu][slab.label]++;
      });
    });
    return Object.values(sguMap).sort((a, b) => {
      const aT = slabLabels.reduce((s, l) => s + (a[l] || 0), 0);
      const bT = slabLabels.reduce((s, l) => s + (b[l] || 0), 0);
      return bT - aT;
    });
  }, [consolidated, ccMap]);
  const activeSlabLabels = useMemo(() => slabLabels.filter(l => sguSlabData.some(d => d[l] > 0)), [sguSlabData]);

  const unallocBySubBand = useMemo(() => {
    const bandMap = {};
    consolidated.forEach(row => {
      const emp = empMap[row.employeeId];
      const band = emp?.subBand || 'Not Specified';
      if (!bandMap[band]) bandMap[band] = { subBand: band, totalUnalloc: 0, count: 0 };
      bandMap[band].totalUnalloc += row.unallocated;
      bandMap[band].count += 1;
    });
    return Object.values(bandMap)
      .map(d => ({ subBand: d.subBand, 'Avg Unallocated %': d.count > 0 ? Math.round(d.totalUnalloc / d.count) : 0, 'Avg Allocated %': d.count > 0 ? 100 - Math.round(d.totalUnalloc / d.count) : 0, Headcount: d.count }))
      .sort((a, b) => b['Avg Unallocated %'] - a['Avg Unallocated %']);
  }, [consolidated, empMap]);

  function handleExport() {
    exportDashboardReport(state.employees, state.costCodes, approvedAllocations, startDate, endDate);
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{payload[0]?.payload?.fullName || label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' && p.name !== 'Employees' && p.name !== 'Headcount' && p.name !== 'Active Employees' && p.name !== 'Approved Allocs' ? `${p.value}%` : p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const CostCodeTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div style={{ background: 'var(--bg-white)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: 180 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.85rem' }}>{d?.fullName}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Category</span>
          <span style={{ fontWeight: 500 }}>{d?.category}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 600 }}>
          <span style={{ color: '#4f46e5' }}>Employees</span>
          <span>{d?.Employees}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="header-actions">
          <div className="date-range-picker">
            <Calendar size={16} />
            <label>From <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
            <span className="range-sep">-</span>
            <label>To <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} /></label>
          </div>
          <label className="filter-item" style={{ minWidth: 140 }}>
            <span>Classification</span>
            <select value={filterClassification} onChange={e => setFilterClassification(e.target.value)}>
              <option value="">All</option>
              {classifications.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="filter-item" style={{ minWidth: 120 }}>
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
          {isAdmin && <button className="btn btn-primary" onClick={handleExport}><Download size={15} /> Export</button>}
        </div>
      </div>

      <div className="date-range-label">
        Showing <strong>Approved</strong> allocations from <strong>{formatDate(startDate)}</strong> to <strong>{formatDate(endDate)}</strong>
        &nbsp;({stats.approvedCount} approved allocations · {consolidated.length} employees)
        {benchEnabled && benchCostCode && <span> · <span className="badge badge-bench" style={{ fontSize: '0.75rem' }}>Bench: {benchCostCode.code}</span></span>}
      </div>

      {/* KPI Cards - always visible */}
      <div className="kpi-grid">
        <div className="kpi-card"><TrendingUp size={22} /><div><div className="kpi-value">{stats.avgUtilization}%</div><div className="kpi-label">Avg Utilization</div></div></div>
        <div className="kpi-card success"><CheckCircle size={22} /><div><div className="kpi-value">{stats.fullyAllocated}</div><div className="kpi-label">Fully Allocated</div></div></div>
        <div className="kpi-card" style={{ color: 'var(--warning)' }}><Clock size={22} /><div><div className="kpi-value">{stats.forecastedCount}</div><div className="kpi-label">Forecasted</div></div></div>
        <div className="kpi-card success"><UserCheck size={22} /><div><div className="kpi-value">{stats.underAllocated}</div><div className="kpi-label">Under-Allocated</div></div></div>
        {stats.overAllocated > 0 && <div className="kpi-card danger"><AlertTriangle size={22} /><div><div className="kpi-value">{stats.overAllocated}</div><div className="kpi-label">Over-Allocated</div></div></div>}
        <div className="kpi-card"><Shield size={22} /><div><div className="kpi-value">{stats.coreCount}</div><div className="kpi-label">Core</div></div></div>
        <div className="kpi-card"><Shield size={22} /><div><div className="kpi-value">{stats.nonCoreCount}</div><div className="kpi-label">Non-Core</div></div></div>
      </div>

      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        {TABS.map(tab => (
          <button key={tab} className={`dashboard-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: Overview ═══════ */}
      {activeTab === 'Overview' && (
        <>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Overall Resource Utilization</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={capacityDonutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} label={({ name, value }) => `${name}: ${value}%`} fontSize={12}>
                    <Cell fill="#10b981" />
                    <Cell fill="#9ca3af" />
                  </Pie>
                  <Tooltip formatter={v => `${v}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Employee Status Breakdown</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={typeDonutData}
                    dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                    label={({ name, value }) => `${name}: ${value}`} fontSize={11}
                  >
                    {typeDonutData.map((_, i) => <Cell key={i} fill={statusColors[i]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${v} employees`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Utilization by Classification</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, classificationData.length * 50)}>
                <BarChart data={classificationData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                  <YAxis type="category" dataKey="classification" width={95} fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="Avg Utilization" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Headcount" fill="#06b6d4" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Employee Count by POD</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={podCountData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`} fontSize={11}>
                    {podCountData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${v} employees`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="charts-grid">
            <div className="chart-card chart-card-full">
              <h3>Utilization by POD</h3>
              <ResponsiveContainer width="100%" height={Math.max(250, podUtilData.length * 45)}>
                <BarChart data={podUtilData} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                  <YAxis type="category" dataKey="pod" width={115} fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="Avg Utilization" fill="#4f46e5" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Headcount" fill="#06b6d4" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Fully Allocated" fill="#10b981" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ═══════ TAB: SGU & Sub Band ═══════ */}
      {activeTab === 'SGU & Sub Band' && (
        <>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Employee Count by SGU</h3>
              <ResponsiveContainer width="100%" height={Math.max(250, sguAllocationData.length * 45)}>
                <BarChart data={sguAllocationData} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="sgu" width={115} fontSize={11} />
                  <Tooltip formatter={v => `${v} employees`} />
                  <Legend />
                  <Bar dataKey="Employees" fill="#4f46e5" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Employees by Utilization Slab per SGU</h3>
              <ResponsiveContainer width="100%" height={Math.max(280, sguSlabData.length * 45)}>
                <BarChart data={sguSlabData} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="sgu" width={115} fontSize={11} />
                  <Tooltip formatter={(v) => `${v} employees`} />
                  <Legend />
                  {activeSlabLabels.map(label => <Bar key={label} dataKey={label} stackId="a" fill={slabColors[label]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Utilization vs Unallocated by Sub Band</h3>
              <ResponsiveContainer width="100%" height={Math.max(250, unallocBySubBand.length * 40)}>
                <BarChart data={unallocBySubBand} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="subBand" width={95} fontSize={11} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="Avg Allocated %" stackId="a" fill="#10b981" />
                  <Bar dataKey="Avg Unallocated %" stackId="a" fill="#9ca3af" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ═══════ TAB: Cost Codes ═══════ */}
      {activeTab === 'Cost Codes' && (
        <>
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Cost Codes — Employee Count</h3>
              <ResponsiveContainer width="100%" height={Math.max(300, costCodeBarData.length * 44)}>
                <BarChart data={costCodeBarData} layout="vertical" margin={{ left: 80, right: 30, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} fontSize={11} />
                  <YAxis type="category" dataKey="name" width={75} fontSize={11} tick={{ fill: 'var(--text-primary)' }} />
                  <Tooltip content={<CostCodeTooltip />} />
                  <Legend />
                  <Bar dataKey="Employees" fill="#4f46e5" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Allocation by Cost Code Category</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={categoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}%`} fontSize={11}>
                    {categoryPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${v}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ═══════ TAB: Trends ═══════ */}
      {activeTab === 'Trends' && (
        <>
          <div className="charts-grid">
            <div className="chart-card chart-card-full">
              <h3>Monthly Utilization & Activity Trend (Approved Only)</h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={trendData} margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis yAxisId="left" tickFormatter={v => `${v}%`} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="Avg Utilization" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="Active Employees" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="Approved Allocs" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
