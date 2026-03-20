const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const costCodeRoutes = require('./routes/costCodes');
const allocationRoutes = require('./routes/allocations');
const lookupRoutes = require('./routes/lookups');
const submissionRoutes = require('./routes/submissions');
const schemaRoutes = require('./routes/schemas');

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '6mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/cost-codes', costCodeRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/schemas', schemaRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

module.exports = app;
