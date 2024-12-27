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

## Auth

```shell
# get access key, secret, and token from aws console
export AWS_ACCESS_KEY_ID=<>
export AWS_SECRET_ACCESS_KEY=<>
export AWS_SESSION_TOKEN=<>
# assume role, optional
aws sts assume-role --role-arn "arn:aws:iam::547*****681:role/Admin" --role-session-name <session_name>
```

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

How to connect (ssh) to the containers with AWS ECS/Fargate/EC2?

We could use aws cli `ecs execute-command` as mentioned in this blog [post](https://aws.amazon.com/blogs/containers/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/) and this stackoverflow [question](https://stackoverflow.com/questions/52310447/is-it-possible-to-ssh-into-fargate-managed-container-instances).

## Redshift

1. SQL [COPY](https://docs.aws.amazon.com/redshift/latest/dg/r_COPY.html) from data files (in S3, EMR cluster, or a remote host accessed with ssh) or DynamoDB table.
2. COPY from parquet and orc file formats blog [post](https://aws.amazon.com/about-aws/whats-new/2018/06/amazon-redshift-can-now-copy-from-parquet-and-orc-file-formats/)
3. redshift node type details [doc](https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-clusters.html#rs-node-type-info)

## S3

```shell
$ aws s3 rm s3://<path/prefix>/<key>  --profile <profile_name> --recursive # delete files and folder
# delete files and folder
$ aws s3 rm --profile <profile_name> s3://<path/prefix>/ --recursive
```

## VPC

Reference: VPC quota limits [doc](https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html).

Each AWS account is allowed for five (5) VPCs and five (5) Elastic IPs per region.

## References

1. How formal methods helped AWS to design amazing services [post](https://awsmaniac.com/how-formal-methods-helped-aws-to-design-amazing-services/)
