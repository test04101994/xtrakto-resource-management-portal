import { useState, useMemo, useEffect } from 'react';
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export default function DataTable({ columns, data, actions, searchPlaceholder = 'Search...', selectable = false, selectedIds, onSelectionChange, highlightId }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [flashId, setFlashId] = useState(null);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      columns.some(col => {
        const val = col.render ? col.render(row) : row[col.key];
        return String(val ?? '').toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const colDef = columns.find(c => c.key === sortCol);
    const sortValueFn = colDef?.sortValue;
    const actualSortKey = colDef?.sortKey || sortCol;
    return [...filtered].sort((a, b) => {
      const aVal = sortValueFn ? (sortValueFn(a) ?? '') : (a[actualSortKey] ?? '');
      const bVal = sortValueFn ? (sortValueFn(b) ?? '') : (b[actualSortKey] ?? '');
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedRows = sorted.slice(startIdx, startIdx + pageSize);

  // Reset to page 1 only when search changes (not on data updates like approve/cancel)
  useMemo(() => {
    setCurrentPage(1);
  }, [search]);

  // Navigate to the page containing highlightId and flash it
  useEffect(() => {
    if (!highlightId) return;
    const idx = sorted.findIndex(r => r.id === highlightId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / pageSize) + 1;
    setCurrentPage(targetPage);
    setFlashId(highlightId);
    const timer = setTimeout(() => setFlashId(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightId, sorted, pageSize]);

  function handleSort(key) {
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  }

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setCurrentPage(1);
  }

  // Selection helpers
  const allPageIds = paginatedRows.map(r => r.id);
  const allPageSelected = selectable && allPageIds.length > 0 && allPageIds.every(id => selectedIds?.has(id));
  const somePageSelected = selectable && allPageIds.some(id => selectedIds?.has(id));

  function toggleSelectAll() {
    if (!onSelectionChange) return;
    if (allPageSelected) {
      const next = new Set(selectedIds);
      allPageIds.forEach(id => next.delete(id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      allPageIds.forEach(id => next.add(id));
      onSelectionChange(next);
    }
  }

  function toggleSelectRow(id) {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  return (
    <div className="data-table-wrapper">
      <div className="table-search">
        <Search size={16} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {selectable && (
                <th className="checkbox-col" style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                    onChange={toggleSelectAll}
                    title={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                  />
                </th>
              )}
              {columns.map(col => (
                <th key={col.key} onClick={() => col.sortable !== false && handleSort(col.key)} className={col.sortable !== false ? 'sortable' : ''}>
                  <span>{col.label}</span>
                  {sortCol === col.key && (sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </th>
              ))}
              {actions && <th className="actions-col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr><td colSpan={columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0)} className="empty-row">No data found</td></tr>
            ) : (
              paginatedRows.map((row, i) => (
                <tr
                  key={row.id || i}
                  className={`${row._rowClass || ''} ${selectable && selectedIds?.has(row.id) ? 'row-selected' : ''} ${flashId === row.id ? 'row-flash' : ''}`}
                >
                  {selectable && (
                    <td className="checkbox-col">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(row.id) || false}
                        onChange={() => toggleSelectRow(row.id)}
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                  ))}
                  {actions && <td className="actions-cell">{actions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <div className="table-footer-left">
          Showing {sorted.length === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + pageSize, sorted.length)} of {sorted.length} records
          {sorted.length !== data.length && <span> (filtered from {data.length})</span>}
          {selectable && selectedIds?.size > 0 && <span className="selection-count"> · {selectedIds.size} selected</span>}
        </div>
        <div className="table-footer-right">
          <div className="page-size-select">
            <span>Rows:</span>
            <select value={pageSize} onChange={handlePageSizeChange}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="pagination">
            <button className="btn-icon" onClick={() => setCurrentPage(1)} disabled={safePage <= 1} title="First page">
              <ChevronsLeft size={14} />
            </button>
            <button className="btn-icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} title="Previous page">
              <ChevronLeft size={14} />
            </button>
            <span className="page-info">Page {safePage} of {totalPages}</span>
            <button className="btn-icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} title="Next page">
              <ChevronRight size={14} />
            </button>
            <button className="btn-icon" onClick={() => setCurrentPage(totalPages)} disabled={safePage >= totalPages} title="Last page">
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
