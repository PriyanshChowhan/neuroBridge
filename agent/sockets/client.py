import socketio
import threading
import os
from concurrent.futures import ThreadPoolExecutor
from pymongo.errors import DuplicateKeyError
from config.db import realtime_data_collection, daily_data_collection
from models.realtime_data import realtime_data
from models.daily_data import daily_data
from workflow.emergency_monitoring import emergency_workflow
from workflow.daily_wellness_check import daily_workflow

sio = socketio.Client()
workflow_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="health-workflow")
workflow_slots = threading.BoundedSemaphore(40)

def submit_workflow(task, description):
    """Bound concurrent and queued work so a downstream outage cannot exhaust threads."""
    if not workflow_slots.acquire(blocking=False):
        print(f"Workflow queue full; dropped {description}")
        return

    future = workflow_executor.submit(task)

    def release_slot(completed):
        try:
            completed.result()
        except Exception as exc:
            print(f"{description} failed: {exc}")
        finally:
            workflow_slots.release()

    future.add_done_callback(release_slot)


def shutdown_executor():
    workflow_executor.shutdown(wait=False, cancel_futures=True)

def register_handlers():

    @sio.on("connect")
    def on_connect():
        print("Connected to server")


    @sio.on("realtimeData")
    def on_realtime_data_handler(data):
        # print("Received Realtime Data:", data)
        try:
            validated = realtime_data(**data)
        except Exception as e:
            print(f"Validation failed for realtime data: {e}")
            return

        def task():
            validated_document = validated.model_dump()
            try:
                realtime_data_collection.insert_one(validated_document)
            except DuplicateKeyError:
                return
            excluded_keys = {"steps", "calories_burned"}
            filtered_data = {
                key: value
                for key, value in validated_document.items()
                if key not in excluded_keys
            }
            initial_state = {
                "data": filtered_data,
                "alert_sent": False,
            }
            emergency_workflow.invoke(initial_state)

        submit_workflow(task, "realtime emergency workflow")



    @sio.on("dailyData")
    def on_daily_data_handler(data):
        # print("Received Daily Data:", data)
        try:
            validated = daily_data(**data)
        except Exception as e:
            print(f"Validation failed for daily data: {e}")
            return

        def task():
            try:
                daily_data_collection.insert_one(validated.model_dump())
            except DuplicateKeyError:
                return
            daily_workflow.invoke({"userId": validated.userId})

        submit_workflow(task, "daily wellness workflow")


    @sio.on("overrideSet")
    def on_override(data):
        print("Override triggered:", data)


    @sio.on("overrideCleared")
    def on_reset():
        print("Override cleared")


    @sio.on("disconnect")
    def on_disconnect():
        print("Disconnected from server")
        

def connect_to_server(url=None):
    register_handlers()
    url = url or os.getenv("SIMULATOR_URL", "http://localhost:4000")
    sio.connect(url)
    sio.wait()

