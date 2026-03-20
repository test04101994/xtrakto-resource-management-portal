require('dotenv').config();
const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { docClient, tables } = require('./dynamo');

async function batchWrite(tableName, items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map(item => ({ PutRequest: { Item: item } })),
      },
    }));
  }
}

async function seed() {
  console.log('Seeding DynamoDB tables...');
  console.log('Tables:', JSON.stringify(tables, null, 2));

  try {
    // Seed credentials
    await batchWrite(tables.credentials, [
      { role: 'Admin', password: 'admin123', displayName: 'System Admin' },
      { role: 'Manager', password: 'manager123', displayName: 'Project Manager' },
      { role: 'Viewer', password: 'viewer123', displayName: 'Report Viewer' },
    ]);
    console.log('Credentials seeded.');

    // Seed lookup values
    await batchWrite(tables.lookups, [
      { category: 'subBand', values: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'Partner'], updatedAt: new Date().toISOString() },
      { category: 'jobFunction', values: ['Consulting', 'Development', 'Infrastructure', 'NA', 'Project & Product Leadership'], updatedAt: new Date().toISOString() },
      { category: 'subJobFunction', values: ['AI Architecture', 'AI Engineering / ML Engineering', 'Automation Engineering', 'Business Analysis', 'Cloud', 'Cloud Architecture', 'Cloud Engineering', 'Data Science', 'Delivery Management', 'DevOps', 'Engagement Management', 'NA', 'Product Management', 'Sales', 'Software / Application Engineering', 'Solution Architecture', 'Technical Support', 'Tester', 'Transformation Solutioning', 'UX/UI Designer', 'UX/UI Developer'], updatedAt: new Date().toISOString() },
      { category: 'roleName', values: ['AI Architect', 'AI Development Lead / ML Development Lead', 'AI Engineer', 'Associate Application Engineer', 'Associate Automation Engineer', 'Associate Business Analyst', 'Associate Data Scientist', 'Associate Full Stack Engineer', 'Associate Project Manager', 'Associate Quality Analyst', 'Associate Technical Support Engineer', 'Business Analyst', 'Cloud Engineer', 'Consulting Client Partner', 'Data Scientist', 'Delivery Lead', 'DevOps Engineering Lead', 'Engagement Lead', 'Engagement Manager', 'Frontend Developer', 'Full Stack Engineer', 'Pre-Sales Lead', 'Principal Cloud Architect', 'Product Lead', 'Product Manager', 'Program Manager', 'Project Manager', 'Quality Analyst', 'Senior AI Architect', 'Senior Application Engineer', 'Senior Cloud Architect', 'Senior Data Scientist', 'Senior Full Stack Engineer', 'Senior Product Lead', 'Senior Technical Support Engineer', 'Solution Architect', 'Technical Support Engineer', 'Technical Support Lead', 'Transformation Solution Consultant', 'Transformation Solutioning Lead', 'UX/UI Designer'], updatedAt: new Date().toISOString() },
      { category: 'country', values: ['India', 'United Kingdom', 'United States'], updatedAt: new Date().toISOString() },
      { category: 'sgu', values: ['Corporate', 'DE & AI Solutions', 'Domain Ops'], updatedAt: new Date().toISOString() },
      { category: 'imu', values: ['Corporate', 'Diversified Industries Group', 'Healthcare and Life Sciences', 'Insurance', 'International Growth Markets', 'Not Applicable'], updatedAt: new Date().toISOString() },
      { category: 'costCodeCategory', values: ['BUG&A', 'Investment', 'Bench', 'COGS'], updatedAt: new Date().toISOString() },
      { category: 'classification', values: ['Core', 'Non-Core'], updatedAt: new Date().toISOString() },
      { category: 'pod', values: ['POD 1', 'POD 2', 'POD 3'], updatedAt: new Date().toISOString() },
    ]);
    console.log('Lookups seeded.');

    // Seed employees
    const empIds = {
      alice: uuidv4(),
      bob: uuidv4(),
      carol: uuidv4(),
      david: uuidv4(),
      eva: uuidv4(),
      frank: uuidv4(),
    };

    const employees = [
      { id: empIds.alice, name: 'Alice Johnson', subBand: 'C2', jobFunction: 'Development', subJobFunction: 'Software / Application Engineering', roleName: 'Senior Full Stack Engineer', avpName: '', vpName: '', cdoLeader: '', country: 'India', classification: 'Core', pod: 'POD 1' },
      { id: empIds.bob, name: 'Bob Smith', subBand: 'C1', jobFunction: 'Development', subJobFunction: 'Software / Application Engineering', roleName: 'Full Stack Engineer', avpName: empIds.alice, vpName: '', cdoLeader: '', country: 'India', classification: 'Core', pod: 'POD 1' },
      { id: empIds.carol, name: 'Carol Davis', subBand: 'D1', jobFunction: 'Project & Product Leadership', subJobFunction: 'Product Management', roleName: 'Product Lead', avpName: '', vpName: '', cdoLeader: '', country: 'United States', classification: 'Core', pod: 'POD 2' },
      { id: empIds.david, name: 'David Wilson', subBand: 'D2', jobFunction: 'Consulting', subJobFunction: 'Engagement Management', roleName: 'Engagement Manager', avpName: '', vpName: '', cdoLeader: '', country: 'United Kingdom', classification: 'Non-Core', pod: 'POD 3' },
      { id: empIds.eva, name: 'Eva Martinez', subBand: 'E1', jobFunction: 'Infrastructure', subJobFunction: 'Cloud Engineering', roleName: 'Senior Cloud Architect', avpName: '', vpName: '', cdoLeader: '', country: 'United States', classification: 'Core', pod: 'POD 2' },
      { id: empIds.frank, name: 'Frank Brown', subBand: 'B2', jobFunction: 'Development', subJobFunction: 'Data Science', roleName: 'Data Scientist', avpName: empIds.alice, vpName: empIds.eva, cdoLeader: '', country: 'India', classification: 'Non-Core', pod: 'POD 3' },
    ].map(e => ({ ...e, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

    await batchWrite(tables.employees, employees);
    console.log('Employees seeded.');

    // Seed cost codes
    const ccIds = {
      prj001: uuidv4(),
      prj002: uuidv4(),
      rnd001: uuidv4(),
      ops001: uuidv4(),
      adm001: uuidv4(),
      sup001: uuidv4(),
    };

    const costCodes = [
      { id: ccIds.prj001, code: 'PRJ-001', category: 'COGS', clientName: 'Acme Corp', name: 'Project Alpha', startDate: '2025-01-01', expiryDate: '2026-12-31', approver: 'Eva Martinez', spoc: 'Alice Johnson', sgu: 'DE & AI Solutions', imu: 'Insurance' },
      { id: ccIds.prj002, code: 'PRJ-002', category: 'Investment', clientName: 'Acme Corp', name: 'Project Beta', startDate: '2025-03-01', expiryDate: '2025-12-31', approver: 'Eva Martinez', spoc: 'Bob Smith', sgu: 'DE & AI Solutions', imu: 'Insurance' },
      { id: ccIds.rnd001, code: 'RND-001', category: 'Investment', clientName: 'Internal', name: 'Research Initiative', startDate: '2025-01-01', expiryDate: '2026-06-30', approver: 'Alice Johnson', spoc: 'Frank Brown', sgu: 'Domain Ops', imu: 'Healthcare and Life Sciences' },
      { id: ccIds.ops001, code: 'OPS-001', category: 'BUG&A', clientName: 'Internal', name: 'Operations', startDate: '2025-01-01', expiryDate: '2026-12-31', approver: 'David Wilson', spoc: 'Carol Davis', sgu: 'Corporate', imu: 'Diversified Industries Group' },
      { id: ccIds.adm001, code: 'ADM-001', category: 'BUG&A', clientName: 'Internal', name: 'Administration', startDate: '2025-01-01', expiryDate: '2026-12-31', approver: 'David Wilson', spoc: 'David Wilson', sgu: 'Corporate', imu: 'Corporate' },
      { id: ccIds.sup001, code: 'SUP-001', category: 'COGS', clientName: 'Global Inc', name: 'Customer Support', startDate: '2025-01-01', expiryDate: '2026-12-31', approver: 'Carol Davis', spoc: 'Carol Davis', sgu: 'Domain Ops', imu: 'Corporate' },
    ].map(c => ({ ...c, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

    await batchWrite(tables.costCodes, costCodes);
    console.log('Cost codes seeded.');

    // Seed allocations
    const allocations = [
      { id: uuidv4(), employeeId: empIds.frank, costCodeId: ccIds.adm001, percentage: 60, startDate: '2025-01-01', endDate: '2025-12-31', allocationType: 'Approved', lastModifiedBy: 'System Admin' },
      { id: uuidv4(), employeeId: empIds.frank, costCodeId: ccIds.ops001, percentage: 40, startDate: '2025-01-01', endDate: '2025-12-31', allocationType: 'Forecasted', lastModifiedBy: 'System Admin' },
      { id: uuidv4(), employeeId: empIds.alice, costCodeId: ccIds.prj001, percentage: 50, startDate: '2025-07-01', endDate: '2025-12-31', allocationType: 'Approved', lastModifiedBy: 'Eva Martinez' },
      { id: uuidv4(), employeeId: empIds.alice, costCodeId: ccIds.prj002, percentage: 30, startDate: '2025-07-01', endDate: '2025-12-31', allocationType: 'Forecasted', lastModifiedBy: 'Eva Martinez' },
      { id: uuidv4(), employeeId: empIds.alice, costCodeId: ccIds.sup001, percentage: 20, startDate: '2025-07-01', endDate: '2025-12-31', allocationType: 'Forecasted', lastModifiedBy: 'Eva Martinez' },
      { id: uuidv4(), employeeId: empIds.bob, costCodeId: ccIds.prj001, percentage: 80, startDate: '2025-07-01', endDate: '2025-12-31', allocationType: 'Approved', lastModifiedBy: 'Alice Johnson' },
      { id: uuidv4(), employeeId: empIds.carol, costCodeId: ccIds.prj001, percentage: 40, startDate: '2025-07-01', endDate: '2025-12-31', allocationType: 'Forecasted', lastModifiedBy: 'System Admin' },
      { id: uuidv4(), employeeId: empIds.carol, costCodeId: ccIds.sup001, percentage: 60, startDate: '2025-07-01', endDate: '2025-12-31', allocationType: 'Approved', lastModifiedBy: 'System Admin' },
    ].map(a => ({ ...a, lastModifiedAt: new Date().toISOString(), createdAt: new Date().toISOString() }));

    await batchWrite(tables.allocations, allocations);
    console.log('Allocations seeded.');

    console.log('Seed completed successfully.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
