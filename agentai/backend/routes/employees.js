const { Router } = require('express');
const { ScanCommand, PutCommand, DeleteCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { docClient, tables } = require('../db/dynamo');
const { getSchema } = require('../utils/schemaLoader');

const router = Router();

// Build item from schema fields + request body
function buildItem(schema, body, id) {
  const item = { id: id || body.id || uuidv4() };
  for (const field of schema.fields) {
    if (field.key === 'id') continue;
    item[field.key] = body[field.key] ?? '';
  }
  return item;
}

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tables.employees }));
    const items = (result.Items || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees
router.post('/', async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name is required' });

  try {
    const schema = await getSchema('employees');
    const item = buildItem(schema, req.body);
    item.createdAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();

    await docClient.send(new PutCommand({ TableName: tables.employees, Item: item }));
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', async (req, res) => {
  try {
    const schema = await getSchema('employees');
    const item = buildItem(schema, req.body, req.params.id);
    item.updatedAt = new Date().toISOString();

    await docClient.send(new PutCommand({ TableName: tables.employees, Item: item }));
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: tables.employees,
      Key: { id: req.params.id },
    }));

    // Cascade: delete all allocations for this employee
    const allocs = await docClient.send(new QueryCommand({
      TableName: tables.allocations,
      IndexName: 'employee-index',
      KeyConditionExpression: 'employeeId = :eid',
      ExpressionAttributeValues: { ':eid': req.params.id },
    }));

    if (allocs.Items && allocs.Items.length > 0) {
      const chunks = [];
      for (let i = 0; i < allocs.Items.length; i += 25) {
        chunks.push(allocs.Items.slice(i, i + 25));
      }
      for (const chunk of chunks) {
        await docClient.send(new BatchWriteCommand({
          RequestItems: {
            [tables.allocations]: chunk.map(a => ({
              DeleteRequest: { Key: { id: a.id } },
            })),
          },
        }));
      }
    }

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/bulk - bulk import
router.post('/bulk', async (req, res) => {
  const { employees } = req.body;
  if (!employees || !Array.isArray(employees)) return res.status(400).json({ error: 'employees array required' });

  try {
    const schema = await getSchema('employees');
    const now = new Date().toISOString();
    const items = employees.map(e => {
      const item = buildItem(schema, e);
      item.createdAt = now;
      item.updatedAt = now;
      return item;
    });

    const chunks = [];
    for (let i = 0; i < items.length; i += 25) {
      chunks.push(items.slice(i, i + 25));
    }
    for (const chunk of chunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tables.employees]: chunk.map(item => ({
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

// DELETE /api/employees/bulk - bulk delete
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  try {
    const empChunks = [];
    for (let i = 0; i < ids.length; i += 25) {
      empChunks.push(ids.slice(i, i + 25));
    }
    for (const chunk of empChunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tables.employees]: chunk.map(id => ({
            DeleteRequest: { Key: { id } },
          })),
        },
      }));
    }

    // Cascade: delete all allocations for these employees
    for (const id of ids) {
      const allocs = await docClient.send(new QueryCommand({
        TableName: tables.allocations,
        IndexName: 'employee-index',
        KeyConditionExpression: 'employeeId = :eid',
        ExpressionAttributeValues: { ':eid': id },
      }));

      if (allocs.Items && allocs.Items.length > 0) {
        const chunks = [];
        for (let i = 0; i < allocs.Items.length; i += 25) {
          chunks.push(allocs.Items.slice(i, i + 25));
        }
        for (const chunk of chunks) {
          await docClient.send(new BatchWriteCommand({
            RequestItems: {
              [tables.allocations]: chunk.map(a => ({
                DeleteRequest: { Key: { id: a.id } },
              })),
            },
          }));
        }
      }
    }

    res.json({ deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
