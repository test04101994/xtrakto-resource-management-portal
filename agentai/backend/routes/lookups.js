const express = require('express');
const { GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, tables } = require('../db/dynamo');

const router = express.Router();

// GET /api/lookups — return all lookup categories
router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tables.lookups }));
    res.json(result.Items || []);
  } catch (err) {
    console.error('GET /lookups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lookups/:category — return values for a specific category
router.get('/:category', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: tables.lookups,
      Key: { category: req.params.category },
    }));
    res.json(result.Item || { category: req.params.category, values: [] });
  } catch (err) {
    console.error(`GET /lookups/${req.params.category} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/lookups/:category — replace all values for a category
router.put('/:category', async (req, res) => {
  try {
    const { values } = req.body;
    if (!Array.isArray(values)) {
      return res.status(400).json({ error: 'values must be an array of strings' });
    }
    const item = {
      category: req.params.category,
      values: [...new Set(values.map(v => String(v).trim()).filter(Boolean))].sort(),
      updatedAt: new Date().toISOString(),
    };
    await docClient.send(new PutCommand({ TableName: tables.lookups, Item: item }));
    res.json(item);
  } catch (err) {
    console.error(`PUT /lookups/${req.params.category} error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lookups/bulk — bulk import all categories at once
router.post('/bulk', async (req, res) => {
  try {
    const { lookups } = req.body; // { designation: [...], team: [...], department: [...], role: [...] }
    if (!lookups || typeof lookups !== 'object') {
      return res.status(400).json({ error: 'lookups must be an object with category keys' });
    }
    const results = {};
    const now = new Date().toISOString();
    for (const [category, values] of Object.entries(lookups)) {
      if (!Array.isArray(values)) continue;
      const item = {
        category,
        values: [...new Set(values.map(v => String(v).trim()).filter(Boolean))].sort(),
        updatedAt: now,
      };
      await docClient.send(new PutCommand({ TableName: tables.lookups, Item: item }));
      results[category] = item;
    }
    res.json(results);
  } catch (err) {
    console.error('POST /lookups/bulk error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
