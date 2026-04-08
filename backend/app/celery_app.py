"""
Celery application configuration.

Broker: Redis
Result backend: Redis
Beat schedule: daily pending transaction processing at 09:00 CLT (13:00 UTC).
"""

import os

from celery import Celery
from celery.schedules import crontab

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery = Celery(
    "fintoc_worker",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.tasks"],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Santiago",
    enable_utc=True,
    task_track_started=True,
    result_expires=86400,  # 24 hours
)

APP_ENV = os.getenv("APP_ENV", "development").lower()

celery.conf.beat_schedule = {
    "process-daily-pending": {
        "task": "app.tasks.process_daily_pending",
        "schedule": crontab(hour=9, minute=0),  # 09:00 CLT
        "args": [],
    },
}

# Development: poll Fintoc for transfer status changes every 10 seconds
if APP_ENV == "development":
    celery.conf.beat_schedule["webhook-simulator-poll"] = {
        "task": "app.tasks.poll_webhook_simulator",
        "schedule": 10.0,  # every 10 seconds
    }
