from pydantic import BaseModel, field_validator
from datetime import datetime, timezone

class BloodPressure(BaseModel):
    systolic: int
    diastolic: int


class realtime_data(BaseModel):
    userId: str
    heart_rate: int
    spo2: int
    stress_level: int
    blood_pressure: BloodPressure
    steps: int
    calories_burned: int
    timestamp: datetime

    @field_validator("timestamp", mode="before")
    def parse_ts(cls, v):
        if isinstance(v, datetime):
            return v
        return datetime.fromtimestamp(v / 1000, tz=timezone.utc)
