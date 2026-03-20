const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, tables } = require('../db/dynamo');

// Default schemas matching current hardcoded fields
const DEFAULT_SCHEMAS = {
  employees: {
    fields: [
      { key: 'name', label: 'Employee Name', type: 'text', builtIn: true, visible: true, required: true, excelHeader: 'Employee Name' },
      { key: 'id', label: 'Emp ID', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'Emp ID' },
      { key: 'subBand', label: 'Sub Band', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'subBand', excelHeader: 'Sub Band' },
      { key: 'jobFunction', label: 'Job Function', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'jobFunction', excelHeader: 'Job Function' },
      { key: 'subJobFunction', label: 'Sub Job Function', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'subJobFunction', excelHeader: 'Sub Job Function' },
      { key: 'roleName', label: 'Role Name', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'roleName', excelHeader: 'Role Name' },
      { key: 'avpName', label: 'AVP and Above', type: 'employeeRef', builtIn: true, visible: true, required: false, excelHeader: 'AVP and Above Name' },
      { key: 'vpName', label: 'VP and Above', type: 'employeeRef', builtIn: true, visible: true, required: false, excelHeader: 'VP and Above Name' },
      { key: 'cdoLeader', label: 'CDO Leader', type: 'employeeRef', builtIn: true, visible: true, required: false, excelHeader: 'CDO Leader' },
      { key: 'country', label: 'Country', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'country', excelHeader: 'Country' },
      { key: 'classification', label: 'Classification', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'classification', excelHeader: 'Classification' },
      { key: 'pod', label: 'POD', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'pod', excelHeader: 'POD' },
    ],
  },
  costCodes: {
    fields: [
      { key: 'code', label: 'Cost Code', type: 'text', builtIn: true, visible: true, required: true, excelHeader: 'Cost Code' },
      { key: 'category', label: 'Category', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'costCodeCategory', excelHeader: 'Category' },
      { key: 'clientName', label: 'Client Name', type: 'text', builtIn: true, visible: true, required: true, excelHeader: 'Client Name' },
      { key: 'name', label: 'Project Name', type: 'text', builtIn: true, visible: true, required: true, excelHeader: 'Project Name' },
      { key: 'startDate', label: 'Start Date', type: 'date', builtIn: true, visible: true, required: true, excelHeader: 'Start Date' },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date', builtIn: true, visible: true, required: true, excelHeader: 'Expiry Date' },
      { key: 'approver', label: 'Approver', type: 'employeeName', builtIn: true, visible: true, required: true, excelHeader: 'Approver' },
      { key: 'spoc', label: 'SPOC', type: 'employeeName', builtIn: true, visible: true, required: true, excelHeader: 'SPOC' },
      { key: 'sgu', label: 'SGU', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'sgu', excelHeader: 'SGU' },
      { key: 'imu', label: 'IMU', type: 'dropdown', builtIn: true, visible: true, required: true, lookupCategory: 'imu', excelHeader: 'IMU' },
    ],
  },
  allocations: {
    fields: [
      { key: 'employeeName', label: 'Employee', type: 'employeeName', builtIn: true, visible: true, required: false, excelHeader: 'Employee Name' },
      { key: 'employeeId', label: 'Employee ID', type: 'employeeRef', builtIn: true, visible: true, required: true, excelHeader: 'Employee ID' },
      { key: 'costCodeCode', label: 'Cost Code', type: 'costCodeRef', builtIn: true, visible: true, required: true, excelHeader: 'Cost Code' },
      { key: 'costCodeName', label: 'Project Name', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'Project Name' },
      { key: 'costCodeCategory', label: 'Category', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'Category' },
      { key: 'sgu', label: 'SGU', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'SGU' },
      { key: 'imu', label: 'IMU', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'IMU' },
      { key: 'percentage', label: 'Allocation %', type: 'number', builtIn: true, visible: true, required: true, excelHeader: 'Percentage (%)' },
      { key: 'startDate', label: 'Start Date', type: 'date', builtIn: true, visible: true, required: true, excelHeader: 'Start Date' },
      { key: 'endDate', label: 'End Date', type: 'date', builtIn: true, visible: true, required: true, excelHeader: 'End Date' },
      { key: 'allocationType', label: 'Type', type: 'dropdown', builtIn: true, visible: true, required: true, dropdownOptions: ['Forecasted', 'Approved', 'Cancelled'], excelHeader: 'Allocation Type' },
      { key: 'comment', label: 'Comment', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'Comment' },
      { key: 'lastModifiedBy', label: 'Last Modified By', type: 'text', builtIn: true, visible: true, required: false, excelHeader: 'Last Modified By' },
    ],
  },
  availableResources: {
    fields: [
      { key: 'employeeName', label: 'Employee', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'employeeId', label: 'Employee ID', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'subBand', label: 'Sub Band', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'roleName', label: 'Role Name', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'country', label: 'Country', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'classification', label: 'Classification', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'pod', label: 'POD', type: 'text', builtIn: true, visible: true, required: false },
      { key: 'startDate', label: 'Available From', type: 'date', builtIn: true, visible: true, required: false },
      { key: 'endDate', label: 'Available To', type: 'date', builtIn: true, visible: true, required: false },
      { key: 'availablePct', label: 'Available %', type: 'number', builtIn: true, visible: true, required: false },
      { key: 'totalAllocated', label: 'Currently Allocated', type: 'number', builtIn: true, visible: true, required: false },
      { key: 'allocations', label: 'Current Assignments', type: 'text', builtIn: true, visible: true, required: false },
    ],
  },
  consolidatedAllocations: {
    fields: [
      { key: 'emp.name', label: 'Employee', source: 'employee', visible: true },
      { key: 'emp.id', label: 'Emp ID', source: 'employee', visible: true },
      { key: 'emp.subBand', label: 'Sub Band', source: 'employee', visible: true },
      { key: 'emp.classification', label: 'Classification', source: 'employee', visible: true },
      { key: 'emp.pod', label: 'POD', source: 'employee', visible: true },
      { key: 'totalAllocated', label: 'Utilization %', source: 'computed', visible: true },
      { key: 'unallocated', label: 'Unallocated %', source: 'computed', visible: true },
      { key: 'allocationCount', label: 'Entries', source: 'computed', visible: true },
    ],
  },
};

// In-memory cache with TTL
const cache = {};
const CACHE_TTL_MS = 60000; // 60 seconds

async function getSchema(entityType) {
  const cacheKey = `schema-${entityType}`;

  // Check cache
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
    return cache[cacheKey].data;
  }

  try {
    const result = await docClient.send(new GetCommand({
      TableName: tables.lookups,
      Key: { category: cacheKey },
    }));

    if (result.Item && result.Item.fields) {
      const schema = { fields: result.Item.fields };
      cache[cacheKey] = { data: schema, timestamp: Date.now() };
      return schema;
    }
  } catch (err) {
    console.error(`Failed to load schema for ${entityType}:`, err.message);
  }

  // Fall back to defaults
  const defaultSchema = DEFAULT_SCHEMAS[entityType];
  if (defaultSchema) {
    cache[cacheKey] = { data: defaultSchema, timestamp: Date.now() };
  }
  return defaultSchema || { fields: [] };
}

async function saveSchema(entityType, fields) {
  const cacheKey = `schema-${entityType}`;
  await docClient.send(new PutCommand({
    TableName: tables.lookups,
    Item: {
      category: cacheKey,
      fields,
      updatedAt: new Date().toISOString(),
    },
  }));
  // Invalidate cache
  delete cache[cacheKey];
}

function clearSchemaCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}

module.exports = { DEFAULT_SCHEMAS, getSchema, saveSchema, clearSchemaCache };
