const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./app');

let serverlessExpressInstance;

exports.handler = async (event, context) => {
  if (!serverlessExpressInstance) {
    serverlessExpressInstance = serverlessExpress({ app });
  }
  return serverlessExpressInstance(event, context);
};
