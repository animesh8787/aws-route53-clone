"""Static DNS / Route 53 reference data shared by validators, seeds and the API."""

# Types users may create. SOA exists only as a system record (or from a BIND import, where it is skipped).
USER_RECORD_TYPES = ("A", "AAAA", "CAA", "CNAME", "MX", "NS", "PTR", "SRV", "TXT")
RECORD_TYPES = (*USER_RECORD_TYPES, "SOA")

ROUTING_POLICIES = ("simple", "weighted", "latency", "failover", "geolocation", "multivalue")

AWS_REGIONS = (
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "ca-central-1", "sa-east-1",
    "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1", "eu-south-1",
    "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
    "me-south-1", "af-south-1",
)  # fmt: skip

CONTINENTS = {
    "AF": "Africa", "AN": "Antarctica", "AS": "Asia", "EU": "Europe",
    "NA": "North America", "OC": "Oceania", "SA": "South America",
}  # fmt: skip

# Rough region -> continent map used by the resolver simulator for latency / geo decisions.
REGION_CONTINENT = {
    "us": "NA", "ca": "NA", "sa": "SA", "eu": "EU", "ap": "AS", "me": "AS", "af": "AF",
}  # fmt: skip

ALIAS_RECORD_TYPES = ("A", "AAAA", "CNAME")

# Alias target kinds -> (label, fixed Route 53 hosted-zone id used by that service; mocked).
ALIAS_TARGET_TYPES = {
    "cloudfront": ("CloudFront distribution", "Z2FDTNDATAQYW2"),
    "elb": ("Application/Classic Load Balancer", "Z35SXDOTRQ7X7K"),
    "s3-website": ("S3 website endpoint", "Z3AQBSTGFYJSTF"),
    "api-gateway": ("API Gateway", "Z1UJRXOUMOOFQ8"),
    "record": ("Another record in this hosted zone", None),
}

MAX_TTL = 2_147_483_647
DEFAULT_TTL = 300
MAX_NAME_LENGTH = 253
MAX_LABEL_LENGTH = 63
MAX_TXT_STRING = 255
MAX_TXT_TOTAL = 4000
MAX_VALUES_PER_RECORD = 100
