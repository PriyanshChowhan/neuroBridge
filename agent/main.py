import os
import signal
import sys

from dotenv import load_dotenv


REQUIRED_ENVIRONMENT = [
    "MONGODB_URI",
    "GOOGLE_API_KEY",
    "SIMULATOR_URL",
    "TWILIO_SERVICE_URL",
    "AMBULANCE_NUMBER",
]


def validate_environment():
    load_dotenv()
    missing = [name for name in REQUIRED_ENVIRONMENT if not os.getenv(name)]
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        return False
    return True


def main():
    if not validate_environment():
        return 1

    # Import workflow modules only after configuration has been validated so
    # missing credentials produce one clear startup error.
    from config.db import init_db
    from cron_job.scheduler import start_schedulers, stop_schedulers
    from sockets.client import connect_to_server, shutdown_executor

    def signal_handler(_sig, _frame):
        print("\nShutting down gracefully...")
        stop_schedulers()
        shutdown_executor()
        raise SystemExit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("Starting app...")
    try:
        db = init_db()
    except Exception as error:
        print(f"Agent startup failed: unable to connect to MongoDB ({error})")
        return 1
    print("Connected to MongoDB:", db.name)
    start_schedulers()

    try:
        connect_to_server()
    except KeyboardInterrupt:
        print("Received interrupt signal")
    finally:
        stop_schedulers()
        shutdown_executor()

    return 0


if __name__ == "__main__":
    sys.exit(main())
