import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

export function exportToExcel(employees, costCodes, allocations) {
  const wb = XLSX.utils.book_new();
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  // Employees sheet
  const empData = employees.map(e => ({
    'Emp ID': e.id,
    'Employee Name': e.name,
    'Sub Band': e.subBand || '',
    'Job Function': e.jobFunction || '',
    'Sub Job Function': e.subJobFunction || '',
    'Role Name': e.roleName || '',
    'AVP and Above Name': e.avpName ? (empMap[e.avpName]?.name || e.avpName) : '',
    'VP and Above Name': e.vpName ? (empMap[e.vpName]?.name || e.vpName) : '',
    'CDO Leader': e.cdoLeader ? (empMap[e.cdoLeader]?.name || e.cdoLeader) : '',
    'Country': e.country || '',
    'Classification': e.classification || '',
    'POD': e.pod || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), 'Employees');

  // Cost Codes sheet
  const ccData = costCodes.map(c => ({
    ID: c.id,
    'Cost Code': c.code,
    Category: c.category || '',
    'Client Name': c.clientName || '',
    'Project Name': c.name,
    'Start Date': c.startDate || '',
    'Expiry Date': c.expiryDate || '',
    Approver: c.approver || '',
    SPOC: c.spoc || '',
    'SGU': c.sgu || '',
    'IMU': c.imu || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ccData), 'Cost Codes');

  // Allocations sheet (with resolved names)
  const empNameMap = Object.fromEntries(employees.map(e => [e.id, e.name]));
  const ccMap = Object.fromEntries(costCodes.map(c => [c.id, c]));
  const allocData = allocations.map(a => {
    const cc = ccMap[a.costCodeId];
    return {
      ID: a.id,
      'Employee ID': a.employeeId,
      Employee: empNameMap[a.employeeId] || a.employeeId,
      'Cost Code': cc?.code || a.costCodeId,
      'Cost Code Name': cc?.name || '',
      'Percentage (%)': a.percentage,
      'Start Date': a.startDate,
      'End Date': a.endDate,
      'Allocation Type': a.allocationType || 'Forecasted',
      'Comment': a.comment || '',
      'Last Modified By': a.lastModifiedBy || '',
      'Last Modified At': a.lastModifiedAt || '',
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allocData), 'Allocations');

  XLSX.writeFile(wb, 'cost_allocation_data.xlsx');
}

export function importFromExcel(file, existingCostCodes = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const result = {};
        const warnings = [];

        // Parse Employees
        if (wb.SheetNames.includes('Employees')) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['Employees'], { raw: false, defval: '' });
          result.employees = [];
          rows.forEach((r, i) => {
            const rowNum = i + 2;
            const name = r['Employee Name'] || r.Name;
            if (!name || String(name).trim() === '') {
              warnings.push(`Employees row ${rowNum}: Missing required field "Employee Name" — skipped.`);
              return;
            }
            result.employees.push({
              id: r['Emp ID'] || r.ID || uuidv4(),
              name: String(name).trim(),
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
            });
          });
        }

        // Parse Cost Codes
        if (wb.SheetNames.includes('Cost Codes')) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['Cost Codes'], { raw: false, defval: '' });
          result.costCodes = [];
          rows.forEach((r, i) => {
            const rowNum = i + 2;
            const code = r['Cost Code'] || r.Code;
            if (!code || String(code).trim() === '') {
              warnings.push(`Cost Codes row ${rowNum}: Missing required field "Cost Code" — skipped.`);
              return;
            }
            const name = r['Project Name'] || r.Name;
            if (!name || String(name).trim() === '') {
              warnings.push(`Cost Codes row ${rowNum}: Missing required field "Project Name" — skipped.`);
              return;
            }
            result.costCodes.push({
              id: r.ID || uuidv4(),
              code: String(code).trim(),
              name: String(name).trim(),
              category: r.Category ? String(r.Category).trim() : '',
              clientName: r['Client Name'] ? String(r['Client Name']).trim() : '',
              approver: r.Approver ? String(r.Approver).trim() : '',
              spoc: r.SPOC ? String(r.SPOC).trim() : '',
              sgu: r['SGU'] ? String(r['SGU']).trim() : '',
              imu: r['IMU'] ? String(r['IMU']).trim() : '',
              startDate: r['Start Date'] ? String(r['Start Date']).trim() : '',
              expiryDate: r['Expiry Date'] ? String(r['Expiry Date']).trim() : '',
            });
          });
        }

        // Parse Allocations with validation
        if (wb.SheetNames.includes('Allocations')) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets['Allocations'], { raw: false, defval: '' });
          const validAllocations = [];
          const skippedRows = [];

          const ccLookup = {};
          existingCostCodes.forEach(c => { ccLookup[c.code] = c.id; });
          if (result.costCodes) {
            result.costCodes.forEach(c => { ccLookup[c.code] = c.id; });
          }

          rows.forEach((r, i) => {
            const rowNum = i + 2;
            const rawPct = r['Percentage (%)'];
            const pct = Number(rawPct);
            const employeeId = r['Employee ID'] || '';
            const costCodeInput = (r['Cost Code'] || '').trim();
            const startDate = r['Start Date'] ? String(r['Start Date']).trim() : '';
            const endDate = r['End Date'] ? String(r['End Date']).trim() : '';

            if (!employeeId) {
              warnings.push(`Allocations row ${rowNum}: Missing "Employee ID" — skipped.`);
              skippedRows.push(rowNum);
              return;
            }
            if (!costCodeInput) {
              warnings.push(`Allocations row ${rowNum}: Missing "Cost Code" — skipped.`);
              skippedRows.push(rowNum);
              return;
            }
            const costCodeId = ccLookup[costCodeInput];
            if (!costCodeId) {
              warnings.push(`Allocations row ${rowNum}: Cost Code "${costCodeInput}" not found — skipped.`);
              skippedRows.push(rowNum);
              return;
            }

            if (rawPct === undefined || rawPct === null || rawPct === '') {
              warnings.push(`Allocations row ${rowNum}: Missing percentage — skipped.`);
              skippedRows.push(rowNum);
              return;
            }
            if (isNaN(pct)) {
              warnings.push(`Allocations row ${rowNum}: Non-numeric percentage "${rawPct}" — skipped.`);
              skippedRows.push(rowNum);
              return;
            }
            if (pct <= 0 || pct > 100) {
              warnings.push(`Allocations row ${rowNum}: Percentage ${pct}% out of range (must be 1–100) — skipped.`);
              skippedRows.push(rowNum);
              return;
            }

            if (!startDate || !endDate) {
              warnings.push(`Allocations row ${rowNum}: Missing start or end date — skipped.`);
              skippedRows.push(rowNum);
              return;
            }
            if (startDate > endDate) {
              warnings.push(`Allocations row ${rowNum}: Start date (${startDate}) is after end date (${endDate}) — skipped.`);
              skippedRows.push(rowNum);
              return;
            }

            validAllocations.push({
              id: r.ID || uuidv4(),
              employeeId,
              costCodeId,
              percentage: pct,
              startDate,
              endDate,
              lastModifiedBy: r['Last Modified By'] ? String(r['Last Modified By']).trim() : '',
              lastModifiedAt: r['Last Modified At'] ? String(r['Last Modified At']).trim() : '',
              allocationType: r['Allocation Type'] ? String(r['Allocation Type']).trim() : 'Forecasted',
              comment: r['Comment'] ? String(r['Comment']).trim() : '',
            });
          });

          const overAllocWarnings = [];
          const empGroups = {};
          validAllocations.forEach(a => {
            if (!empGroups[a.employeeId]) empGroups[a.employeeId] = [];
            empGroups[a.employeeId].push(a);
          });

          for (const [empId, allocs] of Object.entries(empGroups)) {
            const dates = new Set();
            allocs.forEach(a => { dates.add(a.startDate); dates.add(a.endDate); });
            for (const date of dates) {
              const total = allocs
                .filter(a => a.startDate <= date && a.endDate >= date)
                .reduce((sum, a) => sum + a.percentage, 0);
              if (total > 100) {
                overAllocWarnings.push(`Employee "${empId}" exceeds 100% allocation (${total}%) on ${date}.`);
                break;
              }
            }
          }

          if (overAllocWarnings.length > 0) {
            overAllocWarnings.forEach(w => warnings.push(w));
          }

          result.allocations = validAllocations;
        }

        result.warnings = warnings;
        resolve(result);
      } catch (err) {
        reject(new Error('Failed to parse Excel file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function exportDashboardReport(employees, costCodes, allocations, startDate, endDate) {
  const wb = XLSX.utils.book_new();
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const ccMap = Object.fromEntries(costCodes.map(c => [c.id, c]));

  // Sheet 1: All allocations in range
  const allocData = allocations.map(a => {
    const emp = empMap[a.employeeId];
    const cc = ccMap[a.costCodeId];
    return {
      'Employee Name': emp?.name || 'Unknown',
      'Classification': emp?.classification || '',
      'POD': emp?.pod || '',
      'SGU': cc?.sgu || '',
      'IMU': cc?.imu || '',
      'Job Function': emp?.jobFunction || '',
      'Cost Code': cc?.code || 'Unknown',
      'Project Name': cc?.name || '',
      Category: cc?.category || '',
      'Client Name': cc?.clientName || '',
      Approver: cc?.approver || '',
      SPOC: cc?.spoc || '',
      'Allocation %': a.percentage,
      'Allocation Type': a.allocationType || 'Forecasted',
      'Comment': a.comment || '',
      'Start Date': a.startDate,
      'End Date': a.endDate,
      'Last Modified By': a.lastModifiedBy || '',
      'Last Modified At': a.lastModifiedAt || '',
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allocData), 'Allocations');

  // Sheet 2: Employee summary
  const today = new Date().toISOString().slice(0, 10);
  const snapshotDate = (today >= startDate && today <= endDate) ? today : startDate;
  const empRows = employees.map(emp => {
    const empAllocs = allocations.filter(a =>
      a.employeeId === emp.id && a.startDate <= snapshotDate && a.endDate >= snapshotDate
    );
    const total = empAllocs.reduce((s, a) => s + a.percentage, 0);
    const activeCodes = new Set(empAllocs.map(a => ccMap[a.costCodeId]?.code || ''));
    const empSgus = [...new Set(empAllocs.map(a => ccMap[a.costCodeId]?.sgu).filter(Boolean))].join(', ');
    const empImus = [...new Set(empAllocs.map(a => ccMap[a.costCodeId]?.imu).filter(Boolean))].join(', ');
    return {
      'Employee': emp.name || 'Unknown',
      'Sub Band': emp.subBand || '',
      'Job Function': emp.jobFunction || '',
      'SGU': empSgus,
      'IMU': empImus,
      'Country': emp.country || '',
      'Classification': emp.classification || '',
      'POD': emp.pod || '',
      'Approved %': empAllocs.filter(a => a.allocationType === 'Approved').reduce((s, a) => s + a.percentage, 0),
      'Forecasted %': empAllocs.filter(a => (a.allocationType || 'Forecasted') === 'Forecasted').reduce((s, a) => s + a.percentage, 0),
      'Cancelled %': empAllocs.filter(a => a.allocationType === 'Cancelled').reduce((s, a) => s + a.percentage, 0),
      'Allocation % (as of)': total,
      'As of Date': snapshotDate,
      'Cost Codes': [...activeCodes].join(', '),
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows), 'Employee Summary');

  // Sheet 3: Cost code summary
  const ccSummary = {};
  allocations.forEach(a => {
    const cc = ccMap[a.costCodeId];
    const key = a.costCodeId;
    if (!ccSummary[key]) {
      ccSummary[key] = { 'Cost Code': cc?.code || '', 'Project Name': cc?.name || '', 'Category': cc?.category || '', 'Client Name': cc?.clientName || '', 'Approver': cc?.approver || '', 'SPOC': cc?.spoc || '', 'Employee Count': new Set(), 'Total %': 0 };
    }
    ccSummary[key]['Employee Count'].add(a.employeeId);
    ccSummary[key]['Total %'] += a.percentage;
  });
  const ccRows = Object.values(ccSummary).map(c => ({ ...c, 'Employee Count': c['Employee Count'].size }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ccRows), 'Cost Code Summary');

  const filename = `dashboard_report_${startDate}_to_${endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportFilteredAllocations(employees, costCodes, allocations) {
  const wb = XLSX.utils.book_new();
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const ccMap = Object.fromEntries(costCodes.map(c => [c.id, c]));

  const data = allocations.map(a => {
    const emp = empMap[a.employeeId];
    const cc = ccMap[a.costCodeId];
    return {
      'Employee Name': emp?.name || 'Unknown',
      'Employee ID': a.employeeId,
      'Classification': emp?.classification || '',
      'POD': emp?.pod || '',
      'SGU': cc?.sgu || '',
      'IMU': cc?.imu || '',
      'Job Function': emp?.jobFunction || '',
      'Cost Code': cc?.code || 'Unknown',
      'Project Name': cc?.name || '',
      Category: cc?.category || '',
      'Client Name': cc?.clientName || '',
      Approver: cc?.approver || '',
      SPOC: cc?.spoc || '',
      'Allocation %': a.percentage,
      'Allocation Type': a.allocationType || 'Forecasted',
      'Comment': a.comment || '',
      'Start Date': a.startDate,
      'End Date': a.endDate,
      'Last Modified By': a.lastModifiedBy || '',
      'Last Modified At': a.lastModifiedAt || '',
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Allocations');

  XLSX.writeFile(wb, `allocations_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportAllocationsReport(employees, costCodes, allocations, filterDate) {
  const wb = XLSX.utils.book_new();
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const ccMap = Object.fromEntries(costCodes.map(c => [c.id, c]));

  const filtered = filterDate
    ? allocations.filter(a => a.startDate <= filterDate && a.endDate >= filterDate)
    : allocations;

  const reportData = filtered.map(a => {
    const emp = empMap[a.employeeId];
    const cc = ccMap[a.costCodeId];
    return {
      'Employee Name': emp?.name || 'Unknown',
      'Classification': emp?.classification || '',
      'POD': emp?.pod || '',
      'SGU': cc?.sgu || '',
      'IMU': cc?.imu || '',
      'Job Function': emp?.jobFunction || '',
      'Cost Code': cc?.code || 'Unknown',
      'Project Name': cc?.name || '',
      Category: cc?.category || '',
      'Client Name': cc?.clientName || '',
      Approver: cc?.approver || '',
      SPOC: cc?.spoc || '',
      'Allocation %': a.percentage,
      'Allocation Type': a.allocationType || 'Forecasted',
      'Comment': a.comment || '',
      'Start Date': a.startDate,
      'End Date': a.endDate,
      'Last Modified By': a.lastModifiedBy || '',
      'Last Modified At': a.lastModifiedAt || '',
    };
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData), 'Allocation Report');

  // Summary by cost code
  const summary = {};
  filtered.forEach(a => {
    const cc = ccMap[a.costCodeId];
    const key = cc?.code || a.costCodeId;
    if (!summary[key]) {
      summary[key] = { 'Cost Code': key, 'Project Name': cc?.name || '', 'Category': cc?.category || '', 'Total Allocation %': 0, 'Employee Count': 0 };
    }
    summary[key]['Total Allocation %'] += a.percentage;
    summary[key]['Employee Count'] += 1;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(summary)), 'Summary by Cost Code');

  const filename = filterDate ? `allocation_report_${filterDate}.xlsx` : 'allocation_report_all.xlsx';
  XLSX.writeFile(wb, filename);
}
