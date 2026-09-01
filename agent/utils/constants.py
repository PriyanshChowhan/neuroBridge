import os

diagnosis_workflow_interval = int(os.getenv("DIAGNOSIS_INTERVAL_MINUTES", "1440"))
periodic_wellness_workflow_interval = int(os.getenv("PERIODIC_WELLNESS_INTERVAL_MINUTES", "180"))
# daily_wellness_workflow_interval on getting daily data i.e every 1 min
# emergency_monitoring_workflow_interval on getting realtime data i.e. every 5 sec
