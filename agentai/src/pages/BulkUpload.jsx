import { useRef, useState } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SHEET_CONFIG = {
  Employees: {
    headers: ['Emp ID', 'Employee Name', 'Sub Band', 'Job Function', 'Sub Job Function', 'Role Name', 'AVP and Above Name', 'VP and Above Name', 'CDO Leader', 'Country', 'Classification', 'POD'],
    sample: [
      ['emp-1', 'John Doe', 'C2', 'Development', 'Software / Application Engineering', 'Full Stack Engineer', 'Jane Smith', '', '', 'India', 'Core', 'POD 1'],
      ['emp-2', 'Jane Smith', 'D1', 'Project & Product Leadership', 'Product Management', 'Product Lead', '', '', '', 'United States', 'Non-Core', 'POD 2'],
    ],
    requiredFields: ['Employee Name', 'Sub Band', 'Job Function', 'Sub Job Function', 'Role Name', 'Country', 'Classification', 'POD'],
    parse: (r) => ({
      id: r['Emp ID'] || r.ID || r.id || uuidv4(),
      name: String(r['Employee Name'] || r.Name).trim(),
      subBand: r['Sub Band'] ? String(r['Sub Band']).trim() : '',
      jobFunction: r['Job Function'] ? String(r['Job Function']).trim() : '',
      subJobFunction: r['Sub Job Function'] ? String(r['Sub Job Function']).trim() : '',
      roleName: r['Role Name'] ? String(r['Role Name']).trim() : '',
      avpName: r['AVP and Above Name'] ? String(r['AVP and Above Name']).trim() : '',
      vpName: r['VP and Above Name'] ? String(r['VP and Above Name']).trim() : '',
      cdoLeader: r['CDO Leader'] ? String(r['CDO Leader']).trim() : '',
      country: r['Country'] ? String(r['Country']).trim() : '',
      classification: r['Classification'] ? String(r['Classification']).trim() : '',
      pod: r['POD'] ? String(r['POD']).trim() : '',
    }),
  },
  'Cost Codes': {
    headers: ['ID', 'Cost Code', 'Category', 'Client Name', 'Project Name', 'Start Date', 'Expiry Date', 'Approver', 'SPOC', 'SGU', 'IMU'],
    sample: [
      ['cc-1', 'PRJ-001', 'COGS', 'Acme Corp', 'Project Alpha', '2025-01-01', '2026-12-31', 'Jane Smith', 'John Doe', 'DE & AI Solutions', 'Insurance'],
      ['cc-2', 'PRJ-002', 'Investment', 'Global Inc', 'Project Beta', '2025-03-01', '2025-12-31', 'John Doe', 'Jane Smith', 'Domain Ops', 'Corporate'],
    ],
    requiredFields: ['Cost Code', 'Category', 'Client Name', 'Project Name', 'Start Date', 'Expiry Date', 'Approver', 'SPOC', 'SGU', 'IMU'],
    parse: (r) => ({
      id: r.ID || r.id || uuidv4(),
      code: String(r['Cost Code'] || r.Code).trim(),
      name: String(r['Project Name'] || r.Name).trim(),
      category: r.Category ? String(r.Category).trim() : '',
      clientName: r['Client Name'] ? String(r['Client Name']).trim() : '',
      approver: r.Approver ? String(r.Approver).trim() : '',
      spoc: r.SPOC ? String(r.SPOC).trim() : '',
      sgu: r['SGU'] ? String(r['SGU']).trim() : '',
      imu: r['IMU'] ? String(r['IMU']).trim() : '',
      startDate: r['Start Date'] ? String(r['Start Date']).trim() : '',
      expiryDate: r['Expiry Date'] ? String(r['Expiry Date']).trim() : '',
    }),
  },
  Allocations: {
    headers: ['ID', 'Employee ID', 'Cost Code', 'Percentage (%)', 'Start Date', 'End Date', 'Allocation Type', 'Comment'],
    sample: [
      ['alloc-1', 'emp-1', 'PRJ-001', 50, '2025-01-01', '2025-12-31', 'Forecasted', 'Initial allocation'],
      ['alloc-2', 'emp-2', 'PRJ-002', 75, '2025-03-01', '2025-12-31', 'Approved', ''],
    ],
    requiredFields: ['Employee ID', 'Cost Code', 'Percentage (%)', 'Start Date', 'End Date', 'Allocation Type'],
    parse: (r, rowNum, warns, costCodeMap) => {
      const pct = Number(r['Percentage (%)']);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        warns.push(`Allocations Row ${rowNum}: Invalid percentage "${r['Percentage (%)']}" — skipped.`);
        return null;
      }
      const startDate = String(r['Start Date']).trim();
      const endDate = String(r['End Date']).trim();
      if (startDate > endDate) {
        warns.push(`Allocations Row ${rowNum}: Start date after end date — skipped.`);
        return null;
      }
      const costCodeInput = String(r['Cost Code']).trim();
      const costCodeId = costCodeMap?.[costCodeInput];
      if (!costCodeId) {
        warns.push(`Allocations Row ${rowNum}: Cost Code "${costCodeInput}" not found — skipped.`);
        return null;
      }
      return {
        id: r.ID || r.id || uuidv4(),
        employeeId: String(r['Employee ID']).trim(),
        costCodeId,
        percentage: pct,
        startDate,
        endDate,
        allocationType: r['Allocation Type'] ? String(r['Allocation Type']).trim() : 'Forecasted',
        comment: r['Comment'] ? String(r['Comment']).trim() : '',
        lastModifiedBy: 'Bulk Excel Import',
        lastModifiedAt: new Date().toISOString(),
      };
    },
  },
};

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  Object.entries(SHEET_CONFIG).forEach(([sheetName, config]) => {
    const data = [config.headers, ...config.sample];
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Set column widths
    ws['!cols'] = config.headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  XLSX.writeFile(wb, 'bulk_upload_template.xlsx');
}

export default function BulkUpload() {
  const { state, dispatch } = useAppContext();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  if (!isAdmin) {
    return (
      <div className="page">
        <h1>Bulk Upload</h1>
        <p>Only admins can access this page.</p>
      </div>
    );
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheetNames = wb.SheetNames;
        const parsed = {};
        const allErrors = [];
        const sheetResults = {};

        // Build cost code map: code -> id (from existing DB data)
        const costCodeMap = {};
        (state.costCodes || []).forEach(c => { costCodeMap[c.code] = c.id; });

        // Parse Employees and Cost Codes first, then Allocations
        const sheetOrder = ['Employees', 'Cost Codes', 'Allocations'];
        sheetOrder.forEach(sheetName => {
          const config = SHEET_CONFIG[sheetName];
          // Try exact match, then case-insensitive
          let sheet = wb.Sheets[sheetName];
          if (!sheet) {
            const match = sheetNames.find(s => s.toLowerCase() === sheetName.toLowerCase());
            if (match) sheet = wb.Sheets[match];
          }

          if (!sheet) {
            sheetResults[sheetName] = { found: false, total: 0, valid: 0 };
            return;
          }

          const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
          const items = [];
          const rowErrors = [];

          rows.forEach((r, i) => {
            const rowNum = i + 2;
            const missing = config.requiredFields.filter(f => !r[f] || String(r[f]).trim() === '');
            if (missing.length > 0) {
              rowErrors.push(`${sheetName} Row ${rowNum}: Missing ${missing.join(', ')}`);
              return;
            }
            const item = config.parse(r, rowNum, rowErrors, costCodeMap);
            if (item) items.push(item);
          });

          // After parsing Cost Codes sheet, add imported codes to the map
          if (sheetName === 'Cost Codes') {
            items.forEach(c => { costCodeMap[c.code] = c.id; });
          }

          parsed[sheetName] = items;
          sheetResults[sheetName] = { found: true, total: rows.length, valid: items.length };
          allErrors.push(...rowErrors);
        });

        // Block upload if any errors found
        if (allErrors.length > 0) {
          setError('Upload failed — all required fields must be filled for every row. Fix the errors below and re-upload.');
          setResult({ errors: allErrors });
          return;
        }

        const hasData = Object.values(parsed).some(arr => arr.length > 0);
        if (!hasData) {
          setError('No valid data found in any sheet. Make sure sheets are named: Employees, Cost Codes, Allocations');
          return;
        }

        setResult({ parsed, sheetResults, warnings: [], fileName: file.name });
      } catch (err) {
        setError('Failed to parse file: ' + err.message);
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function confirmImport() {
    if (!result) return;
    setImporting(true);
    setError('');
    try {
      const payload = {};
      if (result.parsed.Employees?.length) payload.employees = result.parsed.Employees;
      if (result.parsed['Cost Codes']?.length) payload.costCodes = result.parsed['Cost Codes'];
      if (result.parsed.Allocations?.length) payload.allocations = result.parsed.Allocations;
      await dispatch({ type: 'IMPORT_DATA', payload });
      setResult({ ...result, imported: true });
    } catch (err) {
      setError('Import failed: ' + err.message);
    }
    setImporting(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Bulk Upload</h1>
        <div className="header-actions">
          <button className="btn" onClick={downloadTemplate}>
            <Download size={14} /> Download Template
          </button>
        </div>
      </div>

      <div className="bulk-upload-info">
        <FileSpreadsheet size={20} />
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>Upload a single Excel file with 3 sheets</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Sheets must be named: <strong>Employees</strong>, <strong>Cost Codes</strong>, <strong>Allocations</strong>.
            You can include any combination — only sheets found will be imported. Download the template to see the expected format.
          </p>
        </div>
      </div>

      <input type="file" ref={fileRef} accept=".xlsx,.xls" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} onChange={handleFile} />

      {!result && (
        <div className="bulk-upload-dropzone" onClick={() => fileRef.current?.click()}>
          <Upload size={40} strokeWidth={1.5} />
          <p style={{ margin: '12px 0 4px', fontWeight: 600, fontSize: '1.1rem' }}>Click to upload Excel file</p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Supports .xlsx and .xls files</p>
        </div>
      )}

      {error && <div className="form-error" style={{ marginTop: 16 }}>{error}</div>}

      {result?.errors && (
        <div style={{ marginTop: 12 }}>
          <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: '0.85rem', maxHeight: 300, overflowY: 'auto' }}>
            {result.errors.map((e, i) => <li key={i} className="text-danger">{e}</li>)}
          </ul>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { setResult(null); setError(''); }}>Dismiss</button>
          </div>
        </div>
      )}

      {result && !result.imported && !result.errors && (
        <div className="bulk-upload-preview">
          <h3>Preview — {result.fileName}</h3>
          <div className="bulk-sheets-grid">
            {Object.entries(SHEET_CONFIG).map(([sheetName]) => {
              const sr = result.sheetResults[sheetName];
              return (
                <div key={sheetName} className={`bulk-sheet-card ${sr?.found ? (sr.valid > 0 ? 'success' : 'warning') : 'missing'}`}>
                  <div className="bulk-sheet-icon">
                    {!sr?.found ? <XCircle size={24} /> : sr.valid > 0 ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                  </div>
                  <div className="bulk-sheet-name">{sheetName}</div>
                  {sr?.found ? (
                    <div className="bulk-sheet-count">{sr.valid} valid / {sr.total} rows</div>
                  ) : (
                    <div className="bulk-sheet-count">Sheet not found</div>
                  )}
                </div>
              );
            })}
          </div>


          <p style={{ margin: '12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Importing will <strong>replace all existing data</strong> for the sheets found. This cannot be undone.
          </p>

          <div className="form-actions">
            <button className="btn" onClick={() => setResult(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import All Data'}
            </button>
          </div>
        </div>
      )}

      {result?.imported && (
        <div className="bulk-upload-success">
          <CheckCircle size={48} />
          <h3>Import Complete</h3>
          <div className="bulk-sheets-grid">
            {Object.entries(result.sheetResults).filter(([, sr]) => sr.found && sr.valid > 0).map(([name, sr]) => (
              <div key={name} className="bulk-sheet-card success">
                <CheckCircle size={20} />
                <div className="bulk-sheet-name">{name}</div>
                <div className="bulk-sheet-count">{sr.valid} records imported</div>
              </div>
            ))}
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => { setResult(null); }}>Upload Another</button>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Go to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}
