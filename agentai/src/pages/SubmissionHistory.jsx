import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { submissionsApi } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { Download, Send, Clock, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SubmissionHistory() {
  const { isAdmin } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSubmissions();
  }, []);

  async function loadSubmissions() {
    setLoading(true);
    setError('');
    try {
      const data = await submissionsApi.getAll();
      setSubmissions(data);
    } catch (err) {
      setError('Failed to load submissions: ' + err.message);
    }
    setLoading(false);
  }

  function handleDownload(submission) {
    // Regenerate Excel from stored snapshot
    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(submission.summarySnapshot);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Consolidated');
    const wsDetail = XLSX.utils.json_to_sheet(submission.detailSnapshot);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Allocation Details');
    XLSX.writeFile(wb, `RMG_Submission_${submission.startDate}_to_${submission.endDate}_${submission.submittedAt.slice(0, 10)}.xlsx`);
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="page-header"><h1>Submission History</h1></div>
        <div className="role-notice"><Lock size={13} /> Only admins can view submission history.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Submission History</h1>
          <p className="text-muted" style={{ margin: '4px 0 0' }}>
            All reports submitted to RMG · {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="empty-state">
          <Send size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>No submissions yet. Use the "Submit to RMG" button on the Consolidated Allocations page to create your first submission.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Submitted At</th>
              <th>Submitted By</th>
              <th>Date Range</th>
              <th>Employees</th>
              <th>Under-Allocated</th>
              <th>Fully Allocated</th>
              <th>Over-Allocated</th>
              <th>Unallocated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} className="text-muted" />
                    {new Date(s.submittedAt).toLocaleString()}
                  </div>
                </td>
                <td>{s.submittedBy}</td>
                <td>{formatDate(s.startDate)} — {formatDate(s.endDate)}</td>
                <td>{s.employeeCount}</td>
                <td>{s.stats?.underAllocated || 0}</td>
                <td>{s.stats?.fullyAllocated || 0}</td>
                <td>{s.stats?.overAllocated || 0}</td>
                <td>{s.stats?.unallocated || 0}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => handleDownload(s)} title="Download snapshot">
                    <Download size={13} /> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
