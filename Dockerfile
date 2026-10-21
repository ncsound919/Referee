FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY referee_core ./referee_core

RUN pip install --no-cache-dir .

ENV REFEREE_MAX_CSV_MB=25

# Fail closed by default. The service refuses every request with 503 when no
# operator key is configured, so a deployment that forgets its secret is
# closed rather than open. Supply REFEREE_API_KEY at run time.
ENV REFEREE_ENV=production
EXPOSE 8000

CMD ["uvicorn", "referee_core.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
