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

## EC2

How to find EC2 image infor by AMI id?

```shell
# find ec2 image info by AMI id
aws ec2 describe-images \
  --image-id ami-0c7d8678e345b414c \
  --query "Images[*].Description[]" \
  --output text \
  --region us-east-1
```

## Data Science and Machine Learning on AWS

1. "Data Science on AWS" [book](https://www.datascienceonaws.com/), also has the "Generative AI on AWS" book.
