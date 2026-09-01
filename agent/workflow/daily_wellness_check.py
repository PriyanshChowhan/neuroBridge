from langgraph.graph import StateGraph, END
from typing import TypedDict
from langchain.chat_models import init_chat_model
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from config.db import daily_data_collection
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import PromptTemplate
import json
import requests
import os
from utils.spam_avoidance import claim_cooldown, complete_cooldown, release_cooldown

load_dotenv()

TWILIO_SERVICE_URL = os.getenv("TWILIO_SERVICE_URL", "http://localhost:3000").rstrip("/")
REQUEST_TIMEOUT = (5, 20)

model = init_chat_model(model="gemini-3.1-flash-lite", model_provider="google_genai")




# ---- STATE ----
class State(TypedDict, total=False):
    userId: str
    data: dict
    status: str
    sms_message: str
    cooldown_type: str
    cooldown_token: str


# ---- NODES ----
def aggregate_data(state: State):
    latest_daily_data = daily_data_collection.find_one(
        {"userId": state["userId"]},
        sort=[("timestamp", -1)],
        projection={"_id": 0},
    ) or {}
    if latest_daily_data == {}:
        return {"status": "no_data"}

    cooldown_type = f"daily_wellness:{state['userId']}"
    cooldown_token = claim_cooldown(cooldown_type)
    if not cooldown_token:
        return {"status": "cooldown"}
    
    return {
        "status": "data_collected",
        "data": latest_daily_data,
        "cooldown_type": cooldown_type,
        "cooldown_token": cooldown_token,
    }


def pass_to_llm(state: State):
    data = state["data"]

    class SmsMessage(BaseModel):
        message: str = Field(description='Short SMS message for the patient')


    parser = PydanticOutputParser(pydantic_object=SmsMessage)

    template = PromptTemplate(
        template="""
        You are an AI health assistant performing a daily wellness check.
        Every day, you receive the patient's latest health data.

        Patient Data:
        {patient_data}

        Task:
        1. Analyze the daily data and summarize the patient's overall wellness.
        2. Generate a short, friendly SMS (max 2 sentences, under 200 characters).
        3. Include positive highlights, small alerts if any, and simple tips (hydration, sleep, activity, nutrition).
        4. Avoid medical jargon; keep it motivating and easy to understand.
        5. Return ONLY the SMS text, nothing else.

        
        {format_instruction}
        """,
        input_variables=["patient_data"],
        partial_variables={'format_instruction':parser.get_format_instructions()}
    )

    chain = template | model | parser
    final_result = chain.invoke({"patient_data": json.dumps(data, indent=2, default=str)})

    return {**state, "sms_message": final_result.message}


def sms_alert(state: State):
    print("Sending SMS alert...")
    sms_message = state.get("sms_message")
    print(f"sms_message: {sms_message}")
    # Twilio Integration for SMS
    from utils.patient_context import get_patient_context

    try:
        patient = get_patient_context(state["userId"])
        if not patient["patientPhoneNumber"]:
            raise ValueError("Patient has no phoneNumber and PATIENT_PHONE_NUMBER is unset")
        payload = {"phoneNumber": patient["patientPhoneNumber"], "message": sms_message}
        response = requests.post(
            f"{TWILIO_SERVICE_URL}/send-sms",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        complete_cooldown(state["cooldown_type"], state["cooldown_token"], 20 * 60)
        return {**state, "alert_sent": True}
    except Exception:
        release_cooldown(state["cooldown_type"], state["cooldown_token"])
        raise



# ---- GRAPH ----
graph = StateGraph(State)

graph.add_node("aggregate_data", aggregate_data)
graph.add_node("pass_to_llm", pass_to_llm)
graph.add_node("sms_alert", sms_alert)

graph.set_entry_point("aggregate_data")

# ---- EDGES ----
graph.add_conditional_edges(
    "aggregate_data",
    lambda state: "continue" if state["status"] == "data_collected" else "end",
    {"end": END, "continue": "pass_to_llm"},
)
graph.add_edge("pass_to_llm", "sms_alert")
graph.add_edge("sms_alert", END)


# ---- COMPILE ----
daily_workflow = graph.compile()



