from pydantic import BaseModel


class Answer(BaseModel):
    name: str
    type: str
    ttl: int
    value: str


class ResolveResponse(BaseModel):
    name: str
    type: str
    rcode: str  # NOERROR | NXDOMAIN | REFUSED | SERVFAIL | FORMERR
    answers: list[Answer]
    hosted_zone_id: str | None = None
    record_id: int | None = None
    routing_policy: str | None = None
    forwarded_to: list[str] = []
    blocked_by: str | None = None
    trace: list[str] = []


class DashboardSummary(BaseModel):
    hosted_zones: int
    public_zones: int
    private_zones: int
    records: int
    health_checks: int
    unhealthy_health_checks: int
    recent_zones: list[dict]
    counts: dict[str, int] = {}
