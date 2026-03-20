const { Router } = require('express');
const { GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, tables } = require('../db/dynamo');

const router = Router();

// GET /api/auth/roles
router.get('/roles', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tables.credentials }));
    res.json((result.Items || []).map(r => ({ role: r.role, displayName: r.displayName })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { role, password } = req.body;
  if (!role || !password) return res.status(400).json({ error: 'Role and password required' });

  try {
    const result = await docClient.send(new GetCommand({
      TableName: tables.credentials,
      Key: { role },
    }));

    const item = result.Item;
    if (!item || item.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ role: item.role, displayName: item.displayName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
