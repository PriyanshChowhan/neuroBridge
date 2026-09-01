from pymongo import ASCENDING, DESCENDING, MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise RuntimeError("Missing required environment variable: MONGODB_URI")

client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)

health_data_db = client.health_data_db

realtime_data_collection = health_data_db["realtime_data"]
daily_data_collection = health_data_db["daily_data"]
user_collection = health_data_db["users"]
personal_collection = health_data_db["personals"]
call_sms_history_collection = health_data_db["call_sms_history"]

def init_db():
    """Verify MongoDB is reachable and create indexes used by hot-path queries."""
    client.admin.command("ping")
    realtime_data_collection.create_index(
        [("userId", ASCENDING), ("timestamp", DESCENDING)],
        unique=True,
        partialFilterExpression={"userId": {"$exists": True}, "timestamp": {"$exists": True}},
    )
    daily_data_collection.create_index(
        [("userId", ASCENDING), ("timestamp", DESCENDING)],
        unique=True,
        partialFilterExpression={"userId": {"$exists": True}, "timestamp": {"$exists": True}},
    )
    call_sms_history_collection.create_index(
        [("type", ASCENDING), ("timestamp", DESCENDING)]
    )
    return health_data_db

