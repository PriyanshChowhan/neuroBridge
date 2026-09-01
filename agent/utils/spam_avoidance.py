from datetime import datetime, timedelta, timezone
from uuid import uuid4

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from config.db import call_sms_history_collection


COOLDOWN_MINUTES = 30
RESERVATION_MINUTES = 2


def claim_cooldown(action_type):
    """Atomically reserve an action; concurrent readings cannot claim it twice."""
    now = datetime.now(timezone.utc)
    token = str(uuid4())
    try:
        claimed = call_sms_history_collection.find_one_and_update(
            {
                "_id": f"cooldown:{action_type}",
                "$or": [
                    {"lockedUntil": {"$lte": now}},
                    {"lockedUntil": {"$exists": False}},
                ],
            },
            {
                "$set": {
                    "type": action_type,
                    "claimToken": token,
                    "timestamp": now,
                    "lockedUntil": now + timedelta(minutes=RESERVATION_MINUTES),
                    "status": "pending",
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        return None

    return token if claimed and claimed.get("claimToken") == token else None


def complete_cooldown(action_type, token, cooldown_minutes=COOLDOWN_MINUTES):
    now = datetime.now(timezone.utc)
    result = call_sms_history_collection.update_one(
        {"_id": f"cooldown:{action_type}", "claimToken": token},
        {
            "$set": {
                "timestamp": now,
                "lockedUntil": now + timedelta(minutes=cooldown_minutes),
                "status": "delivered",
            }
        },
    )
    return result.modified_count == 1


def release_cooldown(action_type, token):
    """Release a failed delivery so a later reading can retry immediately."""
    call_sms_history_collection.delete_one(
        {"_id": f"cooldown:{action_type}", "claimToken": token}
    )
