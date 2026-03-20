// Shared utilization calculation logic — used by both Dashboard and Consolidated View
// Calculate utilization across a date range using weighted overlap days
// total_days = (range_end - range_start) + 1
// total_capacity = total_days * 100
// For each allocation: overlap_days * percentage → allocated_sum
// utilization = (allocated_sum / total_capacity) * 100
export function calcUtilization(allocations, rangeStart, rangeEnd) {
  const start = new Date(rangeStart + 'T00:00:00');
  const end = new Date(rangeEnd + 'T00:00:00');
  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) return { utilization: 0, unallocated: 100, totalDays: 0 };

  const totalCapacity = totalDays * 100;
  let allocatedSum = 0;

  allocations.forEach(a => {
    const aStart = new Date(a.startDate + 'T00:00:00');
    const aEnd = new Date(a.endDate + 'T00:00:00');
    const overlapStart = aStart > start ? aStart : start;
    const lastDay = new Date(end.getTime() - 86400000); // end date is exclusive
    const overlapEnd = aEnd < lastDay ? aEnd : lastDay;
    if (overlapStart <= overlapEnd) {
      const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
      allocatedSum += overlapDays * a.percentage;
    }
  });

  const utilization = Math.round((allocatedSum / totalCapacity) * 100 * 100) / 100;
  const unallocated = Math.round(Math.max(0, 100 - utilization) * 100) / 100;
  return { utilization, unallocated, totalDays };
}

// Build per-period bench allocations that fill gaps to 100% for each day
// All dates are INCLUSIVE (Apr 1 to Apr 30 = 30 days)
function buildBenchSegments(allocations, rangeStart, rangeEnd, benchCostCodeId, employeeId) {
  const start = new Date(rangeStart + 'T00:00:00');
  const end = new Date(rangeEnd + 'T00:00:00');
  const totalDays = Math.round((end - start) / 86400000) + 1; // +1 for inclusive end
  if (totalDays <= 0) return [];

  // Calculate allocation % for each day in the range (inclusive)
  const dailyAlloc = new Array(totalDays).fill(0);
  allocations.forEach(a => {
    const aStart = new Date(a.startDate + 'T00:00:00');
    const aEnd = new Date(a.endDate + 'T00:00:00');
    // Only iterate over the overlap portion for efficiency
    const overlapStartMs = Math.max(start.getTime(), aStart.getTime());
    const overlapEndMs = Math.min(end.getTime(), aEnd.getTime());
    if (overlapStartMs > overlapEndMs) return;
    const firstDay = Math.round((overlapStartMs - start.getTime()) / 86400000);
    const lastDay = Math.round((overlapEndMs - start.getTime()) / 86400000);
    for (let d = firstDay; d <= lastDay; d++) {
      dailyAlloc[d] += a.percentage;
    }
  });

  // Build segments: group consecutive days with same bench %
  const segments = [];
  let segStart = null;
  let segBenchPct = null;

  for (let d = 0; d < totalDays; d++) {
    const benchPct = Math.max(0, Math.round((100 - dailyAlloc[d]) * 100) / 100);
    if (benchPct <= 0) {
      if (segStart !== null) {
        segments.push({ startDay: segStart, endDay: d - 1, percentage: segBenchPct });
        segStart = null;
        segBenchPct = null;
      }
      continue;
    }
    if (segStart === null || benchPct !== segBenchPct) {
      if (segStart !== null) {
        segments.push({ startDay: segStart, endDay: d - 1, percentage: segBenchPct });
      }
      segStart = d;
      segBenchPct = benchPct;
    }
  }
  if (segStart !== null) {
    segments.push({ startDay: segStart, endDay: totalDays - 1, percentage: segBenchPct });
  }

  // Convert segments to bench allocation objects
  // Use local date formatting to avoid timezone shift from toISOString()
  function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return segments.map((seg, i) => {
    const sDate = new Date(start.getTime() + seg.startDay * 86400000);
    const eDate = new Date(start.getTime() + seg.endDay * 86400000);
    return {
      id: `bench-${employeeId}-${i}`,
      costCodeId: benchCostCodeId,
      employeeId,
      percentage: seg.percentage,
      startDate: toLocalDateStr(sDate),
      endDate: toLocalDateStr(eDate),
      isBench: true,
    };
  });
}

// Build consolidated data for a set of employees/allocations
// Returns per-employee utilization using only Approved allocations with weighted overlap
// bench: { enabled, costCodeId, costCode } — when enabled, fills unallocated capacity with virtual bench allocation
export function buildConsolidatedData(employees, allocations, costCodes, rangeStart, rangeEnd, filters = {}, bench = {}) {
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const ccMap = Object.fromEntries(costCodes.map(c => [c.id, c]));

  // Filter employees by classification/pod if specified
  let filteredEmployees = employees;
  if (filters.classification) filteredEmployees = filteredEmployees.filter(e => e.classification === filters.classification);
  if (filters.pod) filteredEmployees = filteredEmployees.filter(e => e.pod === filters.pod);

  const grouped = {};

  // Only consider Approved allocations that overlap with the selected date range
  allocations.forEach(a => {
    const type = a.allocationType || 'Forecasted';
    if (type !== 'Approved') return;
    if (a.endDate < rangeStart || a.startDate > rangeEnd) return;

    // Skip if employee is filtered out
    const emp = empMap[a.employeeId];
    if (!emp) return;
    if (filters.classification && emp.classification !== filters.classification) return;
    if (filters.pod && emp.pod !== filters.pod) return;

    if (!grouped[a.employeeId]) {
      grouped[a.employeeId] = { employeeId: a.employeeId, allocations: [] };
    }
    grouped[a.employeeId].allocations.push(a);
  });

  // Include all filtered employees (even those with no approved allocations in range)
  filteredEmployees.forEach(emp => {
    if (!grouped[emp.id]) {
      grouped[emp.id] = { employeeId: emp.id, allocations: [] };
    }
  });

  // For each employee, calculate weighted utilization across the full date range
  const result = Object.values(grouped).map(group => {
    const { utilization, unallocated, totalDays } = calcUtilization(group.allocations, rangeStart, rangeEnd);

    // When bench is enabled and employee has unallocated capacity, inject per-period bench allocations
    if (bench.enabled && bench.costCodeId && bench.costCode && unallocated > 0) {
      const benchAllocations = buildBenchSegments(group.allocations, rangeStart, rangeEnd, bench.costCodeId, group.employeeId);
      if (benchAllocations.length > 0) {
        return {
          ...group,
          allocations: [...group.allocations, ...benchAllocations],
          totalAllocated: 100,
          unallocated: 0,
          totalDays,
          hasBench: true,
          benchPercentage: unallocated,
        };
      }
    }

    return {
      ...group,
      totalAllocated: utilization,
      unallocated,
      totalDays,
    };
  });

  return { consolidated: result, empMap, ccMap, filteredEmployees };
}
