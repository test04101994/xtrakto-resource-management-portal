/**
 * Get total allocation percentage for an employee on a given date,
 * optionally excluding a specific allocation (for editing).
 */
export function getEmployeeTotalAllocation(allocations, employeeId, date, excludeAllocationId = null) {
  return allocations
    .filter(a =>
      a.employeeId === employeeId &&
      a.id !== excludeAllocationId &&
      (a.allocationType || 'Forecasted') !== 'Cancelled' &&
      a.startDate <= date &&
      a.endDate >= date
    )
    .reduce((sum, a) => sum + a.percentage, 0);
}

/**
 * Validate that adding/updating an allocation won't exceed 100% for any date in the range.
 * Checks start date, end date, and all boundary dates of other allocations within the range.
 */
export function validateAllocationPercentage(allocations, employeeId, percentage, startDate, endDate, excludeAllocationId = null) {
  // Collect all critical dates in the range
  const dates = new Set([startDate, endDate]);
  allocations
    .filter(a => a.employeeId === employeeId && a.id !== excludeAllocationId && (a.allocationType || 'Forecasted') !== 'Cancelled')
    .forEach(a => {
      if (a.startDate >= startDate && a.startDate <= endDate) dates.add(a.startDate);
      if (a.endDate >= startDate && a.endDate <= endDate) dates.add(a.endDate);
    });

  for (const date of dates) {
    const existing = getEmployeeTotalAllocation(allocations, employeeId, date, excludeAllocationId);
    if (existing + percentage > 100) {
      return {
        valid: false,
        message: `Total allocation would be ${existing + percentage}% on ${date} (max 100%). Currently ${existing}% allocated.`,
        dateOfConflict: date,
        currentTotal: existing,
      };
    }
  }

  return { valid: true };
}

/**
 * Get allocation status for an employee - returns summary info.
 */
export function getEmployeeAllocationStatus(allocations, employeeId, date) {
  const total = getEmployeeTotalAllocation(allocations, employeeId, date);
  return {
    total,
    remaining: 100 - total,
    isFullyAllocated: total === 100,
    isOverAllocated: total > 100,
  };
}
