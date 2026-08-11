FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PYTHONPATH=/app/backend

WORKDIR /app

# Build React frontend
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*
COPY frontend ./frontend
RUN cd frontend && npm ci && npm run build

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY data ./data
COPY run.py ./run.py

EXPOSE 8080

CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 2 --threads 4 --timeout 60 src.sensepath.app:app
