const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, tables } = require('../db/dynamo');

const router = express.Router();

// GET /api/submissions - list all submissions (sorted newest first)
router.get('/', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tables.submissions }));
    const items = (result.Items || []).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/:id - get a single submission with full snapshot
router.get('/:id', async (req, res) => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: tables.submissions,
      Key: { id: req.params.id },
    }));
    if (!result.Item) return res.status(404).json({ error: 'Submission not found' });
    res.json(result.Item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions - create a new submission with snapshot
router.post('/', async (req, res) => {
  const { submittedBy, startDate, endDate, filters, summarySnapshot, detailSnapshot, employeeCount, stats } = req.body;

  if (!submittedBy || !startDate || !endDate || !summarySnapshot || !detailSnapshot) {
    return res.status(400).json({ error: 'Missing required fields: submittedBy, startDate, endDate, summarySnapshot, detailSnapshot' });
  }

  try {
    const item = {
      id: uuidv4(),
      submittedBy,
      submittedAt: new Date().toISOString(),
      startDate,
      endDate,
      filters: filters || {},
      employeeCount: employeeCount || 0,
      stats: stats || {},
      summarySnapshot,
      detailSnapshot,
    };

    await docClient.send(new PutCommand({
      TableName: tables.submissions,
      Item: item,
    }));

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
