"""Amazon Q-style console assistant: streamed answers, conversation history and feedback."""
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models import AssistantConversation, AssistantMessage, User
from app.schemas.common import Message
from app.services.assistant import service

router = APIRouter(prefix="/assistant", tags=["assistant"])


class PageContext(BaseModel):
    path: str = Field(default="", max_length=300)
    title: str = Field(default="", max_length=200)
    breadcrumbs: list[str] = Field(default_factory=list, max_length=10)
    selected: str = Field(default="", max_length=200)
    errors: list[str] = Field(default_factory=list, max_length=5)


class ChatIn(BaseModel):
    message: str = Field(max_length=service.MAX_INPUT_CHARS + 500)
    conversation_id: str | None = Field(default=None, max_length=40)
    page: PageContext | None = None


class FeedbackIn(BaseModel):
    rating: Literal["up", "down"] | None


@router.get("/status")
def assistant_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.status(db, user.id)


@router.post("/chat")
def chat(body: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Streams the answer as server-sent events: start, status (tool running), delta (text), done or error."""
    service.check_limits(db, user, body.message)
    conversation, turn = service.start_turn(db, user, body.conversation_id, body.message)
    events = service.stream_answer(user.id, user.account_id, conversation.public_id, turn.id, turn.content, body.page.model_dump() if body.page else None)
    headers = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    return StreamingResponse(events, media_type="text/event-stream", headers=headers)


@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = select(AssistantConversation).where(AssistantConversation.owner_id == user.id)
    rows = db.scalars(query.order_by(AssistantConversation.updated_at.desc(), AssistantConversation.id.desc()).limit(50)).all()
    return [{"id": c.public_id, "title": c.title, "updated_at": c.updated_at} for c in rows]


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = service.get_conversation(db, user.id, conversation_id)
    return {
        "id": conversation.public_id, "title": conversation.title,
        "messages": [{"id": m.id, "role": m.role, "content": m.content, "feedback": m.feedback, "created_at": m.created_at} for m in conversation.messages],
    }  # fmt: skip


@router.delete("/conversations/{conversation_id}", response_model=Message)
def delete_conversation(conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = service.get_conversation(db, user.id, conversation_id)
    db.delete(conversation)
    db.commit()
    return Message(detail="Conversation deleted.")


@router.delete("/conversations", response_model=Message)
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(AssistantMessage).where(AssistantMessage.owner_id == user.id))
    db.execute(delete(AssistantConversation).where(AssistantConversation.owner_id == user.id))
    db.commit()
    return Message(detail="Chat history cleared.")


@router.post("/messages/{message_id}/feedback", response_model=Message)
def message_feedback(message_id: int, body: FeedbackIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    message = db.scalar(select(AssistantMessage).where(AssistantMessage.id == message_id, AssistantMessage.owner_id == user.id, AssistantMessage.role == "assistant"))
    if message is None:
        raise NotFoundError("Message not found.")
    message.feedback = body.rating
    db.commit()
    return Message(detail="Thanks for the feedback.")
