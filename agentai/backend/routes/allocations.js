const { Router } = require('express');
const { ScanCommand, PutCommand, DeleteCommand, GetCommand, QueryCommand, BatchWriteCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { docClient, tables } = require('../db/dynamo');
const { getSchema } = require('../utils/schemaLoader');

const router = Router();

// Per-day allocation validation: checks max daily total doesn't exceed 100%
function validateDailyAllocation(existingAllocations, newPercentage, newStartDate, newEndDate, excludeId) {
  // Filter to non-cancelled, exclude current record if editing
  const others = existingAllocations.filter(
    a => (a.allocationType || 'Forecasted') !== 'Cancelled' && a.id !== excludeId
  );

  // Collect all unique boundary dates within the new allocation range
  const boundaries = new Set();
  boundaries.add(newStartDate);
  boundaries.add(newEndDate);
  for (const a of others) {
    if (a.startDate >= newStartDate && a.startDate <= newEndDate) boundaries.add(a.startDate);
    if (a.endDate >= newStartDate && a.endDate <= newEndDate) boundaries.add(a.endDate);
  }
  const dates = [...boundaries].sort();

  // Check each boundary date for max daily allocation
  let maxTotal = 0;
  let maxDate = '';
  for (const d of dates) {
    let dayTotal = Number(newPercentage); // the new/updated allocation
    for (const a of others) {
      if (a.startDate <= d && a.endDate >= d) {
        dayTotal += (a.percentage || 0);
      }
    }
    if (dayTotal > maxTotal) {
      maxTotal = dayTotal;
      maxDate = d;
    }
  }

  if (maxTotal > 100) {
    return { valid: false, total: maxTotal, date: maxDate };
  }
  return { valid: true };
}

// Build item from schema fields + request body (for custom fields)
function buildCustomFields(schema, body) {
  const extra = {};
  for (const field of schema.fields) {
    if (field.key.startsWith('custom_')) {
      extra[field.key] = body[field.key] ?? '';
    }
  }
  return extra;
}

// Helper: get employee/cost-code names for a list of allocations
async function enrichAllocations(items) {
  if (!items.length) return items;

  const empIds = [...new Set(items.map(a => a.employeeId))];
  const ccIds = [...new Set(items.map(a => a.costCodeId))];

  const empMap = {};
  const ccMap = {};

  for (let i = 0; i < empIds.length; i += 100) {
    const batch = empIds.slice(i, i + 100);
    const result = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [tables.employees]: { Keys: batch.map(id => ({ id })) },
      },
    }));
    (result.Responses[tables.employees] || []).forEach(e => { empMap[e.id] = e.name; });
  }

  for (let i = 0; i < ccIds.length; i += 100) {
    const batch = ccIds.slice(i, i + 100);
    const result = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [tables.costCodes]: { Keys: batch.map(id => ({ id })) },
      },
    }));
    (result.Responses[tables.costCodes] || []).forEach(c => { ccMap[c.id] = { code: c.code, name: c.name }; });
  }

  return items.map(a => ({
    ...a,
    employeeName: empMap[a.employeeId] || 'Unknown',
    costCodeCode: ccMap[a.costCodeId]?.code || 'Unknown',
    costCodeName: ccMap[a.costCodeId]?.name || 'Unknown',
  }));
}

// GET /api/allocations
router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tables.allocations }));
    const items = result.Items || [];
    const enriched = await enrichAllocations(items);
    enriched.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/allocations
router.post('/', async (req, res) => {
  const { employeeId, costCodeId, percentage, startDate, endDate, allocationType, lastModifiedBy, comment } = req.body;

  if (!employeeId || !costCodeId || !percentage || !startDate || !endDate) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Validate total allocation doesn't exceed 100%
    const existing = await docClient.send(new QueryCommand({
      TableName: tables.allocations,
      IndexName: 'employee-index',
      KeyConditionExpression: 'employeeId = :eid',
      ExpressionAttributeValues: { ':eid': employeeId },
    }));

    const dailyCheck = validateDailyAllocation(existing.Items || [], percentage, startDate, endDate, null);
    if (!dailyCheck.valid) {
      return res.status(400).json({
        error: `Total allocation would be ${dailyCheck.total}% on ${dailyCheck.date} (max 100%).`,
      });
    }

    const schema = await getSchema('allocations');
    const customFields = buildCustomFields(schema, req.body);

    const item = {
      id: uuidv4(),
      employeeId,
      costCodeId,
      percentage: Number(percentage),
      startDate,
      endDate,
      allocationType: allocationType || 'Forecasted',
      comment: comment || '',
      lastModifiedBy: lastModifiedBy || 'Unknown',
      lastModifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...customFields,
    };

    await docClient.send(new PutCommand({ TableName: tables.allocations, Item: item }));
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/allocations/:id
router.put('/:id', async (req, res) => {
  const { employeeId, costCodeId, percentage, startDate, endDate, allocationType, lastModifiedBy, comment } = req.body;

  try {
    // Validate total allocation excluding current record and cancelled allocations
    const existing = await docClient.send(new QueryCommand({
      TableName: tables.allocations,
      IndexName: 'employee-index',
      KeyConditionExpression: 'employeeId = :eid',
      ExpressionAttributeValues: { ':eid': employeeId },
    }));

    // Only validate percentage if allocation is not being cancelled
    if (allocationType !== 'Cancelled') {
      const dailyCheck = validateDailyAllocation(existing.Items || [], percentage, startDate, endDate, req.params.id);
      if (!dailyCheck.valid) {
        return res.status(400).json({
          error: `Total allocation would be ${dailyCheck.total}% on ${dailyCheck.date} (max 100%).`,
        });
      }
    }

    const schema = await getSchema('allocations');
    const customFields = buildCustomFields(schema, req.body);

    const item = {
      id: req.params.id,
      employeeId,
      costCodeId,
      percentage: Number(percentage),
      startDate,
      endDate,
      allocationType: allocationType || 'Forecasted',
      comment: comment || '',
      lastModifiedBy: lastModifiedBy || 'Unknown',
      lastModifiedAt: new Date().toISOString(),
      ...customFields,
    };

    await docClient.send(new PutCommand({ TableName: tables.allocations, Item: item }));
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/allocations/:id/type
router.patch('/:id/type', async (req, res) => {
  const { allocationType, lastModifiedBy } = req.body;

  try {
    const existing = await docClient.send(new GetCommand({
      TableName: tables.allocations,
      Key: { id: req.params.id },
    }));
    if (!existing.Item) return res.status(404).json({ error: 'Not found' });

    const item = {
      ...existing.Item,
      allocationType,
      lastModifiedBy: lastModifiedBy || existing.Item.lastModifiedBy,
      lastModifiedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: tables.allocations, Item: item }));
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/allocations/:id
router.delete('/:id', async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: tables.allocations,
      Key: { id: req.params.id },
    }));
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/allocations/bulk
router.post('/bulk', async (req, res) => {
  const { allocations } = req.body;
  if (!allocations || !Array.isArray(allocations)) return res.status(400).json({ error: 'allocations array required' });

  try {
    const schema = await getSchema('allocations');
    const now = new Date().toISOString();

    const items = allocations.map(a => {
      const customFields = buildCustomFields(schema, a);
      return {
        id: a.id || uuidv4(),
        employeeId: a.employeeId,
        costCodeId: a.costCodeId,
        percentage: Number(a.percentage),
        startDate: a.startDate,
        endDate: a.endDate,
        allocationType: a.allocationType || 'Forecasted',
        comment: a.comment || '',
        lastModifiedBy: a.lastModifiedBy || 'Bulk Import',
        lastModifiedAt: now,
        createdAt: now,
        ...customFields,
      };
    });

    const chunks = [];
    for (let i = 0; i < items.length; i += 25) {
      chunks.push(items.slice(i, i + 25));
    }
    for (const chunk of chunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tables.allocations]: chunk.map(item => ({
            PutRequest: { Item: item },
          })),
        },
      }));
    }

    res.status(201).json({ imported: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/allocations/bulk - bulk delete
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  try {
    const chunks = [];
    for (let i = 0; i < ids.length; i += 25) {
      chunks.push(ids.slice(i, i + 25));
    }
    for (const chunk of chunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tables.allocations]: chunk.map(id => ({
            DeleteRequest: { Key: { id } },
          })),
        },
      }));
    }

    res.json({ deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
