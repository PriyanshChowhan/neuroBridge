import os

from bson import ObjectId

from config.db import personal_collection, user_collection


def _object_id(value):
    return ObjectId(value) if ObjectId.is_valid(value) else value


def get_patient_context(user_id):
    """Resolve notification details for the patient who produced the reading."""
    user = user_collection.find_one({"_id": _object_id(user_id)}) or {}
    personal = personal_collection.find_one({"userId": _object_id(user_id)}) or {}

    return {
        "userId": str(user_id),
        "patientName": user.get("username") or "Unknown patient",
        "patientAddress": personal.get("address") or "Address unavailable",
        "patientPhoneNumber": user.get("phoneNumber")
        or os.getenv("PATIENT_PHONE_NUMBER"),
        "familyNumber": personal.get("emergencyContact"),
    }
