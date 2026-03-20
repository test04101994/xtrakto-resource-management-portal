const { Router } = require('express');
const { DEFAULT_SCHEMAS, getSchema, saveSchema } = require('../utils/schemaLoader');

const router = Router();

const VALID_ENTITY_TYPES = ['employees', 'costCodes', 'allocations', 'availableResources', 'consolidatedAllocations'];

// GET /api/schemas — return all schemas
router.get('/', async (req, res) => {
  try {
    const schemas = {};
    for (const entityType of VALID_ENTITY_TYPES) {
      schemas[entityType] = await getSchema(entityType);
    }
    res.json(schemas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schemas/:entityType
router.get('/:entityType', async (req, res) => {
  const { entityType } = req.params;
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` });
  }

  try {
    const schema = await getSchema(entityType);
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/schemas/:entityType
router.put('/:entityType', async (req, res) => {
  const { entityType } = req.params;
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: `Invalid entity type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` });
  }

  const { fields } = req.body;
  if (!fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'fields array is required' });
  }

  // Validate field structure
  for (const field of fields) {
    if (!field.key || !field.label) {
      return res.status(400).json({ error: 'Each field must have key and label' });
    }
  }

  // Ensure built-in fields from default schema are not removed
  const defaults = DEFAULT_SCHEMAS[entityType];
  if (defaults) {
    const builtInKeys = defaults.fields.filter(f => f.builtIn).map(f => f.key);
    const submittedKeys = fields.map(f => f.key);
    const missingBuiltIn = builtInKeys.filter(k => !submittedKeys.includes(k));
    if (missingBuiltIn.length > 0) {
      return res.status(400).json({ error: `Cannot remove built-in fields: ${missingBuiltIn.join(', ')}` });
    }
  }

  try {
    await saveSchema(entityType, fields);
    res.json({ entityType, fields });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
