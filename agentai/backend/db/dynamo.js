const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const tables = {
  employees: process.env.EMPLOYEES_TABLE || 'cost-metrics-employees',
  costCodes: process.env.COST_CODES_TABLE || 'cost-metrics-cost-codes',
  allocations: process.env.ALLOCATIONS_TABLE || 'cost-metrics-allocations',
  lookups: process.env.LOOKUPS_TABLE || 'cost-metrics-lookups',
  credentials: process.env.CREDENTIALS_TABLE || 'cost-metrics-credentials',
  submissions: process.env.SUBMISSIONS_TABLE || 'cost-metrics-submissions',
};

module.exports = { docClient, tables };
