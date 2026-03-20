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

// GET /api/cost-codes
router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tables.costCodes }));
    const items = (result.Items || []).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cost-codes
router.post('/', async (req, res) => {
  const { code, name } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name are required' });

  try {
    // Check for duplicate code
    const existing = await docClient.send(new QueryCommand({
      TableName: tables.costCodes,
      IndexName: 'code-index',
      KeyConditionExpression: 'code = :code',
      ExpressionAttributeValues: { ':code': code },
    }));
    if (existing.Items && existing.Items.length > 0) {
      return res.status(409).json({ error: 'Cost code already exists' });
    }

    const schema = await getSchema('costCodes');
    const item = buildItem(schema, req.body);
    item.createdAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();

    await docClient.send(new PutCommand({ TableName: tables.costCodes, Item: item }));
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cost-codes/:id
router.put('/:id', async (req, res) => {
  const { code } = req.body;

  try {
    // Check for duplicate code (excluding current item)
    if (code) {
      const existing = await docClient.send(new QueryCommand({
        TableName: tables.costCodes,
        IndexName: 'code-index',
        KeyConditionExpression: 'code = :code',
        ExpressionAttributeValues: { ':code': code },
      }));
      const conflict = (existing.Items || []).find(i => i.id !== req.params.id);
      if (conflict) {
        return res.status(409).json({ error: 'Cost code already exists' });
      }
    }

    const schema = await getSchema('costCodes');
    const item = buildItem(schema, req.body, req.params.id);
    item.updatedAt = new Date().toISOString();

    await docClient.send(new PutCommand({ TableName: tables.costCodes, Item: item }));
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cost-codes/:id
router.delete('/:id', async (req, res) => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: tables.costCodes,
      Key: { id: req.params.id },
    }));

    // Cascade: delete all allocations for this cost code
    const allocs = await docClient.send(new QueryCommand({
      TableName: tables.allocations,
      IndexName: 'costCode-index',
      KeyConditionExpression: 'costCodeId = :ccid',
      ExpressionAttributeValues: { ':ccid': req.params.id },
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

// POST /api/cost-codes/bulk
router.post('/bulk', async (req, res) => {
  const { costCodes } = req.body;
  if (!costCodes || !Array.isArray(costCodes)) return res.status(400).json({ error: 'costCodes array required' });

  try {
    const schema = await getSchema('costCodes');
    const now = new Date().toISOString();
    const items = costCodes.map(c => {
      const item = buildItem(schema, c);
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
          [tables.costCodes]: chunk.map(item => ({
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

// DELETE /api/cost-codes/bulk - bulk delete
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  try {
    const ccChunks = [];
    for (let i = 0; i < ids.length; i += 25) {
      ccChunks.push(ids.slice(i, i + 25));
    }
    for (const chunk of ccChunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tables.costCodes]: chunk.map(id => ({
            DeleteRequest: { Key: { id } },
          })),
        },
      }));
    }

    // Cascade: delete all allocations for these cost codes
    for (const id of ids) {
      const allocs = await docClient.send(new QueryCommand({
        TableName: tables.allocations,
        IndexName: 'costCode-index',
        KeyConditionExpression: 'costCodeId = :ccid',
        ExpressionAttributeValues: { ':ccid': id },
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
