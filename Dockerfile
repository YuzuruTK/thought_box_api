# Simple Dockerfile for FastAPI + uv
FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml .
COPY main.py .

# Install uv and project dependencies
RUN pip install --upgrade pip \
    && pip install uv \
    && pip install .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]