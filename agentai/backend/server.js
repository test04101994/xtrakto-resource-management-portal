require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./app');

const PORT = process.env.PORT || 3001;

// Serve frontend in production (local only — on AWS, frontend is served from S3/CloudFront)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
