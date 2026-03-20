#!/bin/bash
set -e

# ===== Configuration — Static names =====
STACK_NAME="cost-metrics"
AWS_REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
LAMBDA_BUCKET="cost-metrics-lambda-${ACCOUNT_ID}"
FRONTEND_BUCKET="cost-metrics-frontend-${ACCOUNT_ID}"

# ===== Optional VPC Parameters =====
# Set these environment variables to deploy Lambda into an existing VPC:
#   VPC_ID, PRIVATE_SUBNET_1, PRIVATE_SUBNET_2, SECURITY_GROUP_ID
# If left blank, a new VPC will be created automatically.
VPC_ID="${VPC_ID:-}"
PRIVATE_SUBNET_1="${PRIVATE_SUBNET_1:-}"
PRIVATE_SUBNET_2="${PRIVATE_SUBNET_2:-}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:-}"

echo "============================================"
echo "  Xtrakto.ai Cost Metrics - Deploy"
echo "============================================"
echo "Stack:   $STACK_NAME"
echo "Region:  $AWS_REGION"
echo "Account: $ACCOUNT_ID"
echo ""
echo "Static resource names:"
echo "  Tables:   cost-metrics-employees, cost-metrics-cost-codes,"
echo "            cost-metrics-allocations, cost-metrics-lookups,"
echo "            cost-metrics-credentials, cost-metrics-submissions"
echo "  Lambda:   cost-metrics-api"
echo "  Frontend: $FRONTEND_BUCKET"
echo "  Lambda pkg: $LAMBDA_BUCKET"
echo ""
if [ -n "$VPC_ID" ]; then
  echo "VPC Mode: Using existing VPC"
  echo "  VPC ID:          $VPC_ID"
  echo "  Private Subnet 1: $PRIVATE_SUBNET_1"
  echo "  Private Subnet 2: $PRIVATE_SUBNET_2"
  echo "  Security Group:   $SECURITY_GROUP_ID"
else
  echo "VPC Mode: Creating new VPC with private subnets + NAT Gateway"
fi
echo ""

# Step 1: Create or empty Lambda S3 bucket
echo "[1/8] Preparing Lambda S3 bucket: $LAMBDA_BUCKET ..."
if aws s3api head-bucket --bucket "$LAMBDA_BUCKET" 2>/dev/null; then
  echo "  Bucket exists — emptying..."
  aws s3 rm "s3://${LAMBDA_BUCKET}" --recursive --region "$AWS_REGION"
  echo "  Bucket emptied."
else
  echo "  Creating bucket..."
  if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$LAMBDA_BUCKET" --region "$AWS_REGION"
  else
    aws s3api create-bucket --bucket "$LAMBDA_BUCKET" --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
  fi
  echo "  Bucket created."
fi

# Step 2: Delete existing stack (to recreate tables fresh)
echo "[2/8] Checking for existing stack..."
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].StackStatus' --output text --region "$AWS_REGION" 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "$STACK_STATUS" != "DOES_NOT_EXIST" ]; then
  echo "  Stack exists (status: $STACK_STATUS). Emptying frontend bucket first..."
  # Empty frontend bucket before deleting stack (otherwise S3 delete fails)
  if aws s3api head-bucket --bucket "$FRONTEND_BUCKET" 2>/dev/null; then
    aws s3 rm "s3://${FRONTEND_BUCKET}" --recursive --region "$AWS_REGION" 2>/dev/null || true
  fi
  echo "  Deleting stack..."
  aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$AWS_REGION"
  echo "  Waiting for stack deletion..."
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$AWS_REGION"
  echo "  Stack deleted."
else
  echo "  No existing stack found."
  # Clean up any orphan tables with these names
  for TABLE in cost-metrics-employees cost-metrics-cost-codes cost-metrics-allocations cost-metrics-lookups cost-metrics-credentials cost-metrics-submissions; do
    if aws dynamodb describe-table --table-name "$TABLE" --region "$AWS_REGION" 2>/dev/null >/dev/null; then
      echo "  Deleting orphan table: $TABLE"
      aws dynamodb delete-table --table-name "$TABLE" --region "$AWS_REGION" >/dev/null
    fi
  done
fi

# Step 3: Build frontend
echo "[3/8] Building frontend..."
cd "$(dirname "$0")/.."
npm run build

# Step 4: Package Lambda function
echo "[4/8] Packaging Lambda function..."
cd backend
npm ci --omit=dev
zip -r ../lambda.zip . -x "node_modules/.cache/*" "*.md" ".env*"
cd ..

# Upload Lambda zip to S3
aws s3 cp lambda.zip "s3://${LAMBDA_BUCKET}/lambda.zip" --region "$AWS_REGION"
rm lambda.zip

# Step 5: Deploy CloudFormation stack
echo "[5/8] Creating AWS infrastructure..."

# Build parameters list
CF_PARAMS="ParameterKey=LambdaS3Bucket,ParameterValue=${LAMBDA_BUCKET} ParameterKey=LambdaS3Key,ParameterValue=lambda.zip"

if [ -n "$VPC_ID" ]; then
  CF_PARAMS="$CF_PARAMS ParameterKey=VpcId,ParameterValue=${VPC_ID}"
  CF_PARAMS="$CF_PARAMS ParameterKey=PrivateSubnet1Id,ParameterValue=${PRIVATE_SUBNET_1}"
  CF_PARAMS="$CF_PARAMS ParameterKey=PrivateSubnet2Id,ParameterValue=${PRIVATE_SUBNET_2}"
  CF_PARAMS="$CF_PARAMS ParameterKey=SecurityGroupId,ParameterValue=${SECURITY_GROUP_ID}"
fi

aws cloudformation create-stack \
  --template-body file://infra/cloudformation.yaml \
  --stack-name "$STACK_NAME" \
  --parameters $CF_PARAMS \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION"

echo "  Waiting for stack creation..."
aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME" --region "$AWS_REGION"
echo "  Stack created."

# Step 6: Upload frontend to S3
echo "[6/8] Deploying frontend to S3..."
aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" --delete --region "$AWS_REGION"

# Step 7: Invalidate CloudFront cache
echo "[7/8] Invalidating CloudFront cache..."
CF_DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text --region "$AWS_REGION" | sed 's|https://||')

CF_DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='${CF_DIST_ID}'].Id | [0]" \
  --output text --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ] && [ "$CF_DIST_ID" != "null" ]; then
  aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*" --region "$AWS_REGION" > /dev/null
  echo "  Cache invalidated."
else
  echo "  Skipped (no distribution found)."
fi

# Step 8: Seed DynamoDB tables
echo "[8/8] Seeding DynamoDB tables..."
export EMPLOYEES_TABLE="cost-metrics-employees"
export COST_CODES_TABLE="cost-metrics-cost-codes"
export ALLOCATIONS_TABLE="cost-metrics-allocations"
export LOOKUPS_TABLE="cost-metrics-lookups"
export CREDENTIALS_TABLE="cost-metrics-credentials"
export SUBMISSIONS_TABLE="cost-metrics-submissions"
export AWS_REGION="$AWS_REGION"

cd backend && node db/seed.js && cd ..

# Get outputs
echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"
echo ""

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text --region "$AWS_REGION")

API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text --region "$AWS_REGION")

VPC_OUTPUT=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`VpcId`].OutputValue' \
  --output text --region "$AWS_REGION")

echo "Stack Name:      $STACK_NAME"
echo "Application URL: $CLOUDFRONT_URL"
echo "API Gateway URL: $API_URL"
echo "Frontend Bucket: $FRONTEND_BUCKET"
echo "Lambda Bucket:   $LAMBDA_BUCKET"
echo "VPC ID:          $VPC_OUTPUT"
echo ""
echo "Login: Admin/admin123, Manager/manager123, Viewer/viewer123"
