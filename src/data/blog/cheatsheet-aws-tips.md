---
author: JZ
pubDatetime: 2024-12-07T08:22:00Z
modDatetime: 2024-12-07T10:12:00Z
title: AWS (Amazon Web Services) Tips and Cheatsheet
tags:
  - cheatsheet-apps
description:
  "tips for using AWS"
---

## Table of contents

## Regions and Availability Zones

References

1. [reference](https://aws.amazon.com/about-aws/global-infrastructure/regions_az/)
2. [services by region](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/)

Region Examples

1. North America
   1. us-east-1, norther virginia
   2. us-west-2, oregon
   3. us-west-1, northern california
   4. us-east-2, ohio

### Commercial Regions

1. AMER: North, Central, and South America
2. APAC: Asia and Pacific
3. EMEA: Europe, the Middle East, and Africa. AWS Inc, AWS EMEA, AWS South Africa, AWS Brazil, Korea

References

1. [country groupings](https://en.wikipedia.org/wiki/List_of_country_groupings)
2. [ISO 3166 countries by region](https://gist.github.com/richjenks/15b75f1960bc3321e295)

## Amazon DCV

How to use a GUI client with AWS EC2?

We could use the Amazon DCV client as mentioned [here](https://aws.amazon.com/hpc/dcv/).

## API Gateway

### API Doc Generation

1. Redoc: generate API doc for OpenAPI and Swagger, https://github.com/Redocly/redoc

## Auth

### Credential Configuration

How to perform auth to run aws cli commands?

We can get the aws access key, secret access key, and the session token and use them as environment variables in the current shell session. See this blog [post](https://aws.amazon.com/blogs/security/how-to-find-update-access-keys-password-mfa-aws-management-console/) on where to find and update the access keys. Alternatively, you can use a config file for frequently used credentials, see this [doc](https://docs.aws.amazon.com/cli/latest/topic/config-vars.html#credentials) for configuring.

```shell
# get access key, secret, and token from aws console
export AWS_ACCESS_KEY_ID=<>
export AWS_SECRET_ACCESS_KEY=<>
export AWS_SESSION_TOKEN=<>
# assume role, optional
aws sts assume-role --role-arn "arn:aws:iam::547*****681:role/Admin" --role-session-name <session_name>
```

### Refreshing Credentials

How to refresh credentials so a long-running program can continue to get access?

Sometimes a program may continue to run for extended time until something else finishes. The default expiration time for an IAM role is not long enough and we need to refresh.

1. refresh credentials in python [autorefresh_session](https://www.owenrumney.co.uk/implementing-refreshingawscredentials-python/)
2. [RefreshableCredentials](https://pritul95.github.io/blogs/boto3/2020/08/01/refreshable-boto3-session/)
3. python3 script running indefinitely stackoverflow [question](https://stackoverflow.com/questions/63724485/how-to-refresh-the-boto3-credentials-when-python-script-is-running-indefinitely)

## Cloudformation

[How to validate a cloudformation template](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/validate-template.html)?

```shell
aws cloudformation validate-template --template-body file://sampletemplate.json

# output
{
    "Description": "AWS CloudFormation Sample Template S3_Bucket: Sample template showing how to create a publicly accessible S3 bucket. **WARNING** This template creates an S3 bucket. You will be billed for the AWS resources used if you create a stack from this template.",
    "Parameters": [],
    "Capabilities": []
}
```

[How to import existing (perhaps manually created resource) into cloudformation?](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import.html)

We can use IaC generator or manually import the resource.

## Cloudwatch

### Agent user guide

1. user guide [doc](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html)

### How to monitor across multiple AWS accounts?

1. aws doc user [guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Unified-Cross-Account.html)
2. youtube [video](https://www.youtube.com/watch?v=kFGOkywu-rw)

### log insight search tips

```shell
# search for failures (status code > 500)
fields @message, @timestamp, @logStream, requestId, status
| filter status >= 500
| display @message, @logStream, requestId, status

# search for request log failures
fields @timestamp, @message
| filter responseStatus >= 500
| stats count(*) by responseStatus fields @message, @timestamp
| parse @message "{ \"requestId\": \"*\", *, \"status\": \"*\", *}" as request_id, ignore1, status, ignore2
| filter abs(status) >= 500
| display @timestamp, request_id, status, @logStream
| sort by @timestamp desc
```

For example, we may find AWS integration endpoint request id for a 200 request in log group API-Gateway-Execution-Logs/beta.

```shell
fields @timestamp, @message
| filter @message like /cd6e1d24-8b5c-4434-969d-00db430cd03b/
| display @logStream, @message
| sort @timestamp desc

(cd6e1d24-8b5c-4434-969d-00db430cd03b) AWS Integration Endpoint RequestId : 2a3f76ac-1744-4e6c-91e2-7c1951808d1b
```
then search in the lambda log group /aws/lambda/<lambda_name>-beta-us-west-2

```shell
fields @timestamp, @message
| filter @message like /2a3f76ac-1744-4e6c-91e2-7c1951808d1b/
| sort @timestamp desc
| display @message
```

## DynamoDB

### Integration with Elasticsearch

1. aws blog [post](https://aws.amazon.com/about-aws/whats-new/2015/08/amazon-dynamodb-elasticsearch-integration/)
2. design global secondary indexes (GSI) blog [post](https://aws.amazon.com/blogs/database/how-to-design-amazon-dynamodb-global-secondary-indexes/)

## Data Science and Machine Learning on AWS

1. "Data Science on AWS" [book](https://www.datascienceonaws.com/), also has the "Generative AI on AWS" book.

## EC2

How to find EC2 image information by AMI id?

Check for more at this "Query for the latest Amazon Linux AMI IDs using AWS Systems Manager Parameter Store" [reference](https://aws.amazon.com/blogs/compute/query-for-the-latest-amazon-linux-ami-ids-using-aws-systems-manager-parameter-store/).

```shell
# find ec2 image info by AMI id
aws ec2 describe-images \
  --image-id ami-0c7d8678e345b414c \
  --query "Images[*].Description[]" \
  --output text \
  --region us-east-1

# query list of the AMI name properties
aws ec2 describe-images --owners amazon --filters "Name=name,Values=amzn*" \
  --query 'sort_by(Images, &CreationDate)[].Name'

# query latest AMI with ssm
aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2 \
  --region us-east-1

# use latest in cloud formation
# Use public Systems Manager Parameter
Parameters:
  LatestAmiId:
    Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>'
    Default: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2'

Resources:
 Instance:
    Type: 'AWS::EC2::Instance'
    Properties:
      ImageId: !Ref LatestAmiId
```

## ECS

### Autoscaling

1. cdk (php/Yii2 application) [post](https://dev.to/petrabarus/adding-autoscaling-to-amazon-ecs-with-aws-cdk-building-modern-php-yii2-application-using-aws-126a)
2. autoscale developer [guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
3. ECS task placement [post](https://aws.amazon.com/blogs/compute/amazon-ecs-task-placement/)

### How to connect (ssh) to the containers with AWS ECS/Fargate/EC2?

We could use aws cli `ecs execute-command` as mentioned in this blog [post](https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/) and this stackoverflow [question](https://stackoverflow.com/questions/52310447/is-it-possible-to-ssh-into-fargate-managed-container-instances).

## Glue

1. build data lake with AWS Glue and S3 blog [post](https://aws.amazon.com/blogs/big-data/build-a-data-lake-foundation-with-aws-glue-and-amazon-s3/)

## OpenSearch

1. developer guide [doc](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/search-example.html)
2. quick start guide [post](https://aws.amazon.com/blogs/big-data/amazon-opensearch-tutorial-a-quick-start-guide/)

## Redshift

1. SQL [COPY](https://docs.aws.amazon.com/redshift/latest/dg/r_COPY.html) from data files (in S3, EMR cluster, or a remote host accessed with ssh) or DynamoDB table.
2. COPY from parquet and orc file formats blog [post](https://aws.amazon.com/about-aws/whats-new/2018/06/amazon-redshift-can-now-copy-from-parquet-and-orc-file-formats/)
3. redshift node type details [doc](https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-clusters.html#rs-node-type-info)

## S3

```shell
# delete files and folder
$ aws s3 rm --profile <profile_name> s3://<path/prefix>/ --recursive
```

### cross-account access

AWS repost [article](https://repost.aws/knowledge-center/cross-account-access-s3)

1, Create an S3 bucket in Account A.
2, Create an IAM role or user in Account B.
3, Give the IAM role in Account B permission to download (GET Object) and upload (PUT Object) objects to and from a specific bucket. Use the following IAM policy to also grant the IAM role in Account B permissions to call PutObjectAcl, granting object permissions to the bucket owner:

```json
{
   "Version": "2012-10-17",
   "Statement": [
      { "Effect": "Allow",
         "Action": [ "s3:GetObject", "s3:PutObject", "s3:PutObjectAcl" ],
         "Resource": "arn:aws:s3:::AccountABucketName/*"}
   ]
}
```

for read-only access

```json
{
   "Version": "2012-10-17",
   "Statement": [
      { "Effect": "Allow",
         "Action": [ "s3:Get*", "s3:List*" ],
         "Resource": [ "arn:aws:s3:::AccountABucketName/folder/*", "arn:aws:s3:::AccountABucketName/folder",]
      }
   ]
}
```

Note: Make sure to update the policy to include your user variables (such as account ID, bucket name, and ARN). Also, you can limit access to a specific bucket folder in Account A. To limit access to a specific bucket folder, define the folder name in the resource element, such as "arn:aws:s3:::AccountABucketName/FolderName/*". For more information, see [How can I use IAM policies to grant user-specific access to specific folders?](https://repost.aws/knowledge-center/s3-folder-user-access) You can also create an IAM identity-based policy using the AWS CLI command: example [create-policy](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/iam/create-policy.html#examples).

4, Configure the bucket policy for Account A to grant permissions to the IAM role or user that you created in Account B. Use this bucket policy to grant a user the permissions to GetObject and PutObject for objects in a bucket owned by Account A:

```json
{
   "Version": "2012-10-17",
   "Statement": [
      { "Effect": "Allow",
         "Principal": {"AWS": "arn:aws:iam::AccountB:user/AccountBUserName" },
         "Action": [ "s3:GetObject", "s3:PutObject", "s3:PutObjectAcl" ],
         "Resource": [ "arn:aws:s3:::AccountABucketName/*" ]
      }
   ]
}
```

## SQS

### Redrive from Dead-Letter Queue to Source Queue

1. blog [post1](https://aws.amazon.com/blogs/compute/introducing-amazon-simple-queue-service-dead-letter-queue-redrive-to-source-queues/)
2. blog [post2](https://aws.amazon.com/blogs/aws/enhanced-dlq-management-sqs/)

## VPC

Reference: VPC quota limits [doc](https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html).

Each AWS account is allowed for five (5) VPCs and five (5) Elastic IPs per region.

## References

1. How formal methods helped AWS to design amazing services [post](https://awsmaniac.com/how-formal-methods-helped-aws-to-design-amazing-services/)
