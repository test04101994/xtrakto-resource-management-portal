import { useRef, useState } from 'react';
import { Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from './Modal';

// Fallback templates (used if no headers/sampleRow props passed)
const TEMPLATES = {
  Employees: {
    headers: ['Emp ID', 'Employee Name', 'Sub Band', 'Job Function', 'Sub Job Function', 'Role Name', 'AVP and Above Name', 'VP and Above Name', 'CDO Leader', 'Country', 'Classification', 'POD'],
    sample: ['emp-1', 'John Doe', 'C2', 'Development', 'Software / Application Engineering', 'Full Stack Engineer', 'Jane Smith', '', '', 'India', 'Core', 'POD 1'],
  },
  'Cost Codes': {
    headers: ['ID', 'Cost Code', 'Category', 'Client Name', 'Project Name', 'Start Date', 'Expiry Date', 'Approver', 'SPOC', 'SGU', 'IMU'],
    sample: ['cc-1', 'PRJ-001', 'COGS', 'Acme Corp', 'Project Alpha', '2025-01-01', '2026-12-31', 'Jane Smith', 'John Doe', 'Domain Ops', 'Insurance'],
  },
  Allocations: {
    headers: ['ID', 'Employee ID', 'Cost Code', 'Percentage (%)', 'Start Date', 'End Date', 'Allocation Type', 'Comment'],
    sample: ['alloc-1', 'emp-1', 'PRJ-001', 50, '2025-01-01', '2025-12-31', 'Forecasted', 'Initial allocation'],
  },
};

function downloadTemplate(sheetName, label, customHeaders, customSample) {
  const headers = customHeaders || TEMPLATES[sheetName]?.headers;
  const sample = customSample || TEMPLATES[sheetName]?.sample;
  if (!headers) return;
  const wb = XLSX.utils.book_new();
  const data = sample ? [headers, sample] : [headers];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${label.toLowerCase().replace(/\s+/g, '_')}_template.xlsx`);
}

export default function ExcelUpload({ label, sheetName, parseRow, requiredFields, onImport, headers, sampleRow }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setWarnings([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
        if (!sheet) {
          setError('No data found in the uploaded file.');
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
        if (rows.length === 0) {
          setError('The uploaded file has no data rows.');
          return;
        }

        const parsed = [];
        const errors = [];

        rows.forEach((r, i) => {
          const rowNum = i + 2;
          const missing = requiredFields.filter(f => !r[f] || String(r[f]).trim() === '');
          if (missing.length > 0) {
            errors.push(`Row ${rowNum}: Missing required field(s): ${missing.join(', ')}`);
          }
          const item = parseRow(r, rowNum, errors);
          if (item) parsed.push(item);
        });

        if (errors.length > 0) {
          setError('Upload failed — all required fields must be filled for every row.');
          setWarnings(errors);
          return;
        }

        if (parsed.length === 0) {
          setError('No valid records found after parsing.');
          return;
        }

        setWarnings([]);
        setPreview({ data: parsed, total: rows.length, valid: parsed.length });
      } catch (err) {
        setError('Failed to parse file: ' + err.message);
      }
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function confirmImport() {
    if (preview) {
      onImport(preview.data);
      setPreview(null);
      setWarnings([]);
    }
  }

  function triggerUpload() {
    fileRef.current?.click();
  }

  return (
    <>
      <input
        type="file"
        ref={fileRef}
        accept=".xlsx,.xls,.csv"
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        onChange={handleFile}
      />
      <button className="btn" onClick={() => downloadTemplate(sheetName, label, headers, sampleRow)} title={`Download ${label} template`}>
        <Download size={14} /> Template
      </button>
      <button type="button" className="btn" onClick={triggerUpload} title={`Upload ${label} from Excel`}>
        <Upload size={14} /> Upload
      </button>

      {(preview || error) && (
        <Modal title={`Upload ${label}`} onClose={() => { setPreview(null); setError(''); setWarnings([]); }}>
          <div className="form">
            {error && <div className="form-error">{error}</div>}
            {preview && (
              <>
                <p style={{ margin: '0 0 8px' }}>
                  Found <strong>{preview.valid}</strong> valid records out of <strong>{preview.total}</strong> rows.
                </p>
                {warnings.length > 0 && (
                  <div className="upload-warnings">
                    <strong>Warnings:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '0.85rem' }}>
                      {warnings.map((w, i) => <li key={i} className="text-danger">{w}</li>)}
                    </ul>
                  </div>
                )}
                <p style={{ margin: '8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  This will <strong>replace all existing {label.toLowerCase()} data</strong>. This action cannot be undone.
                </p>
                <div className="form-actions">
                  <button type="button" className="btn" onClick={() => { setPreview(null); setError(''); setWarnings([]); }}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={confirmImport}>
                    Import {preview.valid} Records
                  </button>
                </div>
              </>
            )}
            {!preview && warnings.length > 0 && (
              <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '0.85rem' }}>
                {warnings.map((w, i) => <li key={i} className="text-danger">{w}</li>)}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
