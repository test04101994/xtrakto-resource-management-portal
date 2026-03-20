# Cost Allocation Dashboard

React 19 + Vite 8 application for managing employee cost code allocations.

## Local Development

```bash
npm install
npm run dev
```

## AWS Deployment (CloudFormation + CloudFront)

### Prerequisites
- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- A Lambda deployment package (`lambda.zip`) uploaded to an S3 bucket

### Stack Details
- **Stack Name:** `allocation-dashboard-stack`
- **Region:** `us-east-1`
- **Account ID:** `876570154422`
- **S3 Bucket Pattern:** `allocation-dashboard-frontend-{account_id}`
- **CloudFormation Template:** `infra/cloudformation.yaml`

### Step 1 — Delete Existing Stack

```bash
aws s3 rm s3://allocation-dashboard-frontend-876570154422 --recursive 2>/dev/null; aws cloudformation delete-stack --stack-name allocation-dashboard-stack --region us-east-1 && aws cloudformation wait stack-delete-complete --stack-name allocation-dashboard-stack --region us-east-1
```

### Step 2 — Deploy New Stack

```bash
aws cloudformation deploy --template-file infra/cloudformation.yaml --stack-name allocation-dashboard-stack --region us-east-1 --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DBPassword=PUT_YOUR_PASSWORD_HERE LambdaS3Bucket=PUT_YOUR_BUCKET_HERE
```

Replace:
- `PUT_YOUR_PASSWORD_HERE` — Aurora database password (min 8 characters)
- `PUT_YOUR_BUCKET_HERE` — S3 bucket containing your `lambda.zip`

### Step 3 — Build & Sync Frontend

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name allocation-dashboard-stack --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text) && npm run build && aws s3 sync dist/ s3://$BUCKET --delete
```

### Step 4 — Invalidate CloudFront Cache

```bash
DIST=$(aws cloudformation describe-stacks --stack-name allocation-dashboard-stack --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text) && aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

### One-Liner: Full Clean Deploy

```bash
aws s3 rm s3://allocation-dashboard-frontend-876570154422 --recursive 2>/dev/null; aws cloudformation delete-stack --stack-name allocation-dashboard-stack --region us-east-1 && aws cloudformation wait stack-delete-complete --stack-name allocation-dashboard-stack --region us-east-1 && aws cloudformation deploy --template-file infra/cloudformation.yaml --stack-name allocation-dashboard-stack --region us-east-1 --capabilities CAPABILITY_NAMED_IAM --parameter-overrides DBPassword=PUT_YOUR_PASSWORD_HERE LambdaS3Bucket=PUT_YOUR_BUCKET_HERE && BUCKET=$(aws cloudformation describe-stacks --stack-name allocation-dashboard-stack --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text) && npm run build && aws s3 sync dist/ s3://$BUCKET --delete && DIST=$(aws cloudformation describe-stacks --stack-name allocation-dashboard-stack --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text) && aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

### One-Liner: Delete Stack

```bash
aws s3 rm s3://allocation-dashboard-frontend-876570154422 --recursive 2>/dev/null; aws cloudformation delete-stack --stack-name allocation-dashboard-stack --region us-east-1 && aws cloudformation wait stack-delete-complete --stack-name allocation-dashboard-stack --region us-east-1
```
