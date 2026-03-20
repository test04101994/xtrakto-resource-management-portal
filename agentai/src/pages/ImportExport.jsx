import { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { exportToExcel, importFromExcel, exportAllocationsReport } from '../utils/excelUtils';
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle } from 'lucide-react';

export default function ImportExport() {
  const { state, dispatch } = useAppContext();
  const [status, setStatus] = useState(null); // { type: 'success'|'error'|'warning', message: string }
  const [importWarnings, setImportWarnings] = useState([]);
  const [reportDate, setReportDate] = useState('');
  const fileRef = useRef();

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImportWarnings([]);
    try {
      const data = await importFromExcel(file, state.costCodes);
      dispatch({ type: 'IMPORT_DATA', payload: data });
      const counts = [];
      if (data.employees) counts.push(`${data.employees.length} employees`);
      if (data.costCodes) counts.push(`${data.costCodes.length} cost codes`);
      if (data.allocations) counts.push(`${data.allocations.length} allocations`);

      if (data.warnings && data.warnings.length > 0) {
        setImportWarnings(data.warnings);
        setStatus({ type: 'warning', message: `Imported with ${data.warnings.length} warning(s): ${counts.join(', ')}` });
      } else {
        setStatus({ type: 'success', message: `Imported: ${counts.join(', ')}` });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleExportAll() {
    exportToExcel(state.employees, state.costCodes, state.allocations);
    setStatus({ type: 'success', message: 'Exported all data to cost_allocation_data.xlsx' });
  }

  function handleExportReport() {
    exportAllocationsReport(state.employees, state.costCodes, state.allocations, reportDate || null);
    setStatus({ type: 'success', message: `Exported allocation report${reportDate ? ` for ${reportDate}` : ''}` });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Import / Export</h1>
      </div>

      {status && (
        <div className={`alert ${status.type === 'error' ? 'alert-error' : status.type === 'warning' ? 'alert-warning' : 'alert-success'}`}>
          {status.type === 'error' || status.type === 'warning' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
          <span>{status.message}</span>
          <button className="btn-icon" onClick={() => { setStatus(null); setImportWarnings([]); }}>&times;</button>
        </div>
      )}

      {importWarnings.length > 0 && (
        <div className="import-warnings">
          <h4><AlertTriangle size={14} /> Import Warnings</h4>
          <ul>
            {importWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="cards-grid">
        <div className="card">
          <div className="card-header">
            <Upload size={24} />
            <h2>Import from Excel</h2>
          </div>
          <p>Upload an Excel file (.xlsx) with sheets named "Employees", "Cost Codes", and/or "Allocations". This will <strong>replace</strong> existing data for each sheet found.</p>
          <div className="card-template">
            <h4>Expected Columns:</h4>
            <ul>
              <li><strong>Employees:</strong> ID, Name, Email, Department, Role</li>
              <li><strong>Cost Codes:</strong> ID, Code, Name, Description, Category</li>
              <li><strong>Allocations:</strong> ID, Employee ID, Cost Code ID, Percentage (%), Start Date, End Date</li>
            </ul>
          </div>
          <label className="btn btn-primary upload-btn">
            <Upload size={16} /> Choose File
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} hidden />
          </label>
        </div>

        <div className="card">
          <div className="card-header">
            <Download size={24} />
            <h2>Export All Data</h2>
          </div>
          <p>Download all employees, cost codes, and allocations as an Excel file. This file can be re-imported later.</p>
          <div className="stats-row">
            <div className="stat">{state.employees.length}<small>Employees</small></div>
            <div className="stat">{state.costCodes.length}<small>Cost Codes</small></div>
            <div className="stat">{state.allocations.length}<small>Allocations</small></div>
          </div>
          <button className="btn btn-primary" onClick={handleExportAll}>
            <Download size={16} /> Export All Data
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <FileSpreadsheet size={24} />
            <h2>Export Report</h2>
          </div>
          <p>Generate an allocation report with optional date filter. Includes a summary by cost code.</p>
          <label>
            Filter by Date (optional)
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
          </label>
          <button className="btn btn-primary" onClick={handleExportReport} style={{ marginTop: 12 }}>
            <FileSpreadsheet size={16} /> Export Report
          </button>
        </div>
      </div>
    </div>
  );
}
