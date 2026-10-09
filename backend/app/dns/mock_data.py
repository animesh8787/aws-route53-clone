"""Static mock infrastructure the console refers to (there is no real AWS account behind it)."""

MOCK_VPCS = [
    {"vpc_id": "vpc-0a1b2c3d4e5f60789", "name": "production-vpc", "region": "us-east-1", "cidr": "10.0.0.0/16"},
    {"vpc_id": "vpc-0f9e8d7c6b5a43210", "name": "staging-vpc", "region": "us-east-1", "cidr": "10.1.0.0/16"},
    {"vpc_id": "vpc-01234abcd5678ef90", "name": "default-vpc", "region": "us-east-1", "cidr": "172.31.0.0/16"},
    {"vpc_id": "vpc-0b7c6d5e4f3a29180", "name": "eu-production-vpc", "region": "eu-west-1", "cidr": "10.20.0.0/16"},
    {"vpc_id": "vpc-0c8d7e6f5a4b3a291", "name": "eu-shared-services-vpc", "region": "eu-west-1", "cidr": "10.21.0.0/16"},
    {"vpc_id": "vpc-0d9e8f7a6b5c4b3a2", "name": "ap-analytics-vpc", "region": "ap-southeast-1", "cidr": "10.30.0.0/16"},
]
VPC_BY_ID = {v["vpc_id"]: v for v in MOCK_VPCS}
