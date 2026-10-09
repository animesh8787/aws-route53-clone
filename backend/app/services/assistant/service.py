"""Console assistant ("Amazon Q" panel) backed by Groq's OpenAI-compatible chat API.

The browser never talks to Groq: it posts a question here, and this module streams the answer back as
server-sent events while running read-only tools (`tools.py`) on the user's own data. The API key is read
from the environment and never logged or returned.
"""
import json
import logging
import re
import secrets
from collections.abc import Iterator
from datetime import datetime, time

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationFailure, field_error
from app.core.ratelimit import RateLimiter, TooManyRequests
from app.db.session import SessionLocal
from app.models import AssistantConversation, AssistantMessage, User
from app.services.assistant import tools
from app.services.assistant.prompt import SYSTEM_PROMPT, page_context_message

logger = logging.getLogger("route53.assistant")

MAX_INPUT_CHARS = 10_000
MAX_TOOL_ROUNDS = 4
HISTORY_TURNS = 10
HISTORY_CHARS = 3_000
minute_limiter = RateLimiter(12, 60, "Amazon Q is answering a lot of questions from you right now. Wait a minute and try again.")

# Tests replace this with an httpx.MockTransport; production uses the default network transport.
TRANSPORT: httpx.BaseTransport | None = None


class AssistantUnavailable(Exception):
    """A user-facing reason the model could not answer (no key, rate limit, provider error)."""


# ---------------------------------------------------------------------------------------------- status and limits
def mode() -> str:
    settings = get_settings()
    if settings.assistant_fake:
        return "demo"
    return "groq" if settings.groq_api_key else "off"


def used_today(db: Session, owner_id: int) -> int:
    start = datetime.combine(datetime.utcnow().date(), time.min)
    return db.scalar(select(func.count()).where(AssistantMessage.owner_id == owner_id, AssistantMessage.role == "user", AssistantMessage.created_at >= start)) or 0


def status(db: Session, owner_id: int) -> dict:
    settings = get_settings()
    current = mode()
    return {
        "mode": current,
        "configured": current != "off",
        "model": settings.groq_model if current == "groq" else None,
        "daily_limit": settings.assistant_daily_limit,
        "used_today": used_today(db, owner_id),
        "max_input_chars": MAX_INPUT_CHARS,
    }


def check_limits(db: Session, user: User, message: str) -> None:
    text = message.strip()
    if not text:
        raise ValidationFailure("Enter a question.", [field_error("message", "Enter a question.")])
    if len(text) > MAX_INPUT_CHARS:
        raise ValidationFailure(f"Questions can be up to {MAX_INPUT_CHARS:,} characters.", [field_error("message", f"Keep the question under {MAX_INPUT_CHARS:,} characters.")])
    minute_limiter.check(f"user:{user.id}")
    if used_today(db, user.id) >= get_settings().assistant_daily_limit:
        raise TooManyRequests("You have reached today's Amazon Q limit for this account. It resets at midnight UTC.")


# ---------------------------------------------------------------------------------------------- conversations
def _title(message: str) -> str:
    text = " ".join(message.split())
    return text if len(text) <= 60 else text[:57].rstrip() + "..."


def get_conversation(db: Session, owner_id: int, public_id: str) -> AssistantConversation:
    conversation = db.scalar(select(AssistantConversation).where(AssistantConversation.owner_id == owner_id, AssistantConversation.public_id == public_id))
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    return conversation


def start_turn(db: Session, user: User, conversation_id: str | None, message: str) -> tuple[AssistantConversation, AssistantMessage]:
    if conversation_id:
        conversation = get_conversation(db, user.id, conversation_id)
    else:
        conversation = AssistantConversation(owner_id=user.id, public_id=f"conv-{secrets.token_hex(8)}", title=_title(message))
        db.add(conversation)
        db.flush()
    turn = AssistantMessage(conversation_id=conversation.id, owner_id=user.id, role="user", content=message.strip())
    db.add(turn)
    conversation.updated_at = datetime.utcnow()
    db.commit()
    return conversation, turn


def _history(db: Session, conversation: AssistantConversation, current_id: int) -> list[dict]:
    rows = db.scalars(select(AssistantMessage).where(AssistantMessage.conversation_id == conversation.id, AssistantMessage.id < current_id).order_by(AssistantMessage.id.desc()).limit(HISTORY_TURNS)).all()
    return [{"role": m.role, "content": m.content[:HISTORY_CHARS]} for m in reversed(rows)]


# ---------------------------------------------------------------------------------------------- Groq client
def _friendly(status_code: int, body: str) -> str:
    if status_code == 401:
        return "Amazon Q could not authenticate with its language-model provider. The administrator needs to check GROQ_API_KEY."
    if status_code == 429:
        return "Amazon Q has reached its free-tier rate limit for the moment. Try again in a minute."
    if status_code == 413 or "context_length" in body:
        return "That conversation is too long for Amazon Q. Start a new chat and ask again."
    if status_code >= 500:
        return "Amazon Q's language-model provider is temporarily unavailable. Try again shortly."
    return "Amazon Q could not answer that request. Try rephrasing the question."


def _stream_chunks(client: httpx.Client, model: str, messages: list[dict], use_tools: bool) -> Iterator[dict]:
    settings = get_settings()
    body: dict = {"model": model, "messages": messages, "stream": True, "temperature": 0.2, "max_completion_tokens": 1500}
    if use_tools:
        body["tools"] = tools.TOOL_SPECS
        body["tool_choice"] = "auto"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    with client.stream("POST", f"{settings.groq_base_url.rstrip('/')}/chat/completions", json=body, headers=headers) as response:
        if response.status_code != 200:
            text = response.read().decode("utf-8", "replace")[:500]
            raise httpx.HTTPStatusError(text, request=response.request, response=response)
        for line in response.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                yield json.loads(payload)
            except json.JSONDecodeError:
                continue


def _model_round(client: httpx.Client, model: str, messages: list[dict], use_tools: bool) -> Iterator[tuple[str, object]]:
    """One streamed completion. Yields ("text", str) as text arrives, then ("calls", list) once with any tool calls."""
    calls: dict[int, dict] = {}
    for chunk in _stream_chunks(client, model, messages, use_tools):
        for choice in chunk.get("choices") or []:
            delta = choice.get("delta") or {}
            if delta.get("content"):
                yield "text", delta["content"]
            for call in delta.get("tool_calls") or []:
                slot = calls.setdefault(call.get("index", 0), {"id": "", "name": "", "arguments": ""})
                slot["id"] = call.get("id") or slot["id"]
                fn = call.get("function") or {}
                slot["name"] += fn.get("name") or ""
                slot["arguments"] += fn.get("arguments") or ""
    yield "calls", [calls[i] for i in sorted(calls)]


def _answer_with_groq(db: Session, owner_id: int, messages: list[dict]) -> Iterator[tuple[str, str]]:
    """Yields ("status", label) while tools run and ("delta", text) as the answer streams."""
    settings = get_settings()
    models = [settings.groq_model] + ([settings.groq_fallback_model] if settings.groq_fallback_model and settings.groq_fallback_model != settings.groq_model else [])
    with httpx.Client(transport=TRANSPORT, timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        for index, model in enumerate(models):
            produced = False
            try:
                for round_number in range(MAX_TOOL_ROUNDS + 1):
                    use_tools = round_number < MAX_TOOL_ROUNDS
                    text_parts: list[str] = []
                    calls: list[dict] = []
                    for kind, value in _model_round(client, model, messages, use_tools):
                        if kind == "text":
                            produced = True
                            text_parts.append(str(value))
                            yield "delta", str(value)
                        else:
                            calls = value  # type: ignore[assignment]
                    if not calls:
                        return
                    messages.append({
                        "role": "assistant", "content": "".join(text_parts) or None,
                        "tool_calls": [{"id": c["id"] or f"call_{i}", "type": "function", "function": {"name": c["name"], "arguments": c["arguments"] or "{}"}} for i, c in enumerate(calls)],
                    })  # fmt: skip
                    for i, call in enumerate(calls):
                        yield "status", tools.TOOL_LABELS.get(call["name"], "Looking that up")
                        messages.append({"role": "tool", "tool_call_id": call["id"] or f"call_{i}", "content": tools.run_tool(db, owner_id, call["name"], call["arguments"])})
                return
            except httpx.HTTPStatusError as exc:
                status_code, body = exc.response.status_code, str(exc)
                logger.warning("Assistant provider error %s on model %s", status_code, model)
                retryable = status_code == 404 or "model" in body and ("decommissioned" in body or "not found" in body or "does not exist" in body) or "tool_use_failed" in body
                if produced or not retryable or index == len(models) - 1:
                    raise AssistantUnavailable(_friendly(status_code, body)) from exc
            except httpx.HTTPError as exc:
                logger.warning("Assistant provider unreachable: %s", type(exc).__name__)
                raise AssistantUnavailable("Amazon Q's language-model provider could not be reached. Try again shortly.") from exc


# ---------------------------------------------------------------------------------------------- offline demo mode
def _table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    head = "| " + " | ".join(label for _, label in columns) + " |\n| " + " | ".join("---" for _ in columns) + " |\n"
    return head + "\n".join("| " + " | ".join(str(r.get(key, "")) for key, _ in columns) + " |" for r in rows)


def _answer_demo(db: Session, owner_id: int, question: str, page: dict | None) -> Iterator[tuple[str, str]]:
    """Deterministic answers without a model, used by automated tests and when demoing without a key."""
    q = question.lower()
    host = re.search(r"\b((?:[a-z0-9-]+\.)+[a-z]{2,})\b", q)
    if "zone" in q:
        yield "status", tools.TOOL_LABELS["list_hosted_zones"]
        data = json.loads(tools.list_hosted_zones(db, owner_id))
        text = f"You have **{data['count']}** hosted zone(s). Here are the first ones:\n\n" + _table(data["hosted_zones"][:10], [("name", "Name"), ("type", "Type"), ("records", "Records"), ("id", "Hosted zone ID")])
    elif "health" in q:
        yield "status", tools.TOOL_LABELS["list_health_checks"]
        data = json.loads(tools.list_health_checks(db, owner_id))["health_checks"]
        text = f"You have **{len(data)}** health check(s):\n\n" + _table(data, [("name", "Name"), ("status", "Status"), ("endpoint", "Endpoint"), ("used_by_records", "Used by records")])
    elif any(word in q for word in ("cost", "bill", "price", "spend")):
        yield "status", tools.TOOL_LABELS["get_billing_estimate"]
        data = json.loads(tools.get_billing_estimate(db, owner_id))
        text = f"Your estimated monthly Route 53 cost is **${data['total_usd']:.2f}** (simulated prices).\n\n" + _table(data["lines"], [("service", "Service"), ("description", "Item"), ("monthly", "Monthly (USD)")])
    elif host and any(word in q for word in ("resolve", "dig", "answer", "why", "lookup")):
        yield "status", tools.TOOL_LABELS["resolve_dns"]
        data = json.loads(tools.resolve_dns(db, owner_id, name=host.group(1)))
        answers = ", ".join(a["value"] for a in data["answers"]) or "no answer"
        text = f"A query for `{data['name']}` returns **{data['rcode']}** with {answers}.\n\nHow it was answered:\n" + "\n".join(f"- {t}" for t in data["trace"])
    else:
        where = (page or {}).get("title") or "the Route 53 console"
        text = (
            f"I can see you're on **{where}**. I'm running in demo mode, so I answer a few kinds of questions from your data: "
            "ask about your **hosted zones**, **health checks**, your **cost**, or how a name such as `www.example.com` **resolves**.\n\n"
            "With a language model configured I can also explain Route 53 concepts and write AWS CLI commands, for example:\n\n"
            "```bash\naws route53 list-resource-record-sets --hosted-zone-id Z0123456789EXAMPLE\n```"
        )
    for piece in re.findall(r"\S+\s*", text):
        yield "delta", piece


# ---------------------------------------------------------------------------------------------- streaming endpoint body
def _event(kind: str, data: dict) -> str:
    return f"event: {kind}\ndata: {json.dumps(data)}\n\n"


def stream_answer(user_id: int, account_id: str, conversation_public_id: str, message_id: int, question: str, page: dict | None) -> Iterator[str]:
    """Server-sent events for one answer. Runs in a worker thread with its own database session."""
    with SessionLocal() as db:
        conversation = get_conversation(db, user_id, conversation_public_id)
        yield _event("start", {"conversation_id": conversation.public_id, "title": conversation.title})
        parts: list[str] = []
        try:
            if mode() == "demo":
                source = _answer_demo(db, user_id, question, page)
            elif mode() == "off":
                raise AssistantUnavailable("Amazon Q is not configured on this deployment. The administrator needs to set GROQ_API_KEY on the backend.")
            else:
                messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "system", "content": page_context_message(page, account_id)}]
                messages += _history(db, conversation, message_id)
                messages.append({"role": "user", "content": question})
                source = _answer_with_groq(db, user_id, messages)
            for kind, value in source:
                if kind == "delta":
                    parts.append(value)
                yield _event(kind, {"text": value})
        except AssistantUnavailable as exc:
            yield _event("error", {"message": str(exc)})
            return
        except Exception:  # never leak internals to the browser
            logger.exception("Assistant failed")
            yield _event("error", {"message": "Amazon Q ran into a problem answering that. Try again."})
            return
        answer = "".join(parts).strip() or "I don't have an answer for that. Try rephrasing the question."
        reply = AssistantMessage(conversation_id=conversation.id, owner_id=user_id, role="assistant", content=answer)
        db.add(reply)
        conversation.updated_at = datetime.utcnow()
        db.commit()
        yield _event("done", {"message_id": reply.id, "conversation_id": conversation.public_id})
