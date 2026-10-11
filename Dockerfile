FROM python:3.12-slim

# AWS Lambda Web Adapter: lets this same HTTP image run on Lambda (Function URL). It is a
# Lambda extension and does nothing when the image runs anywhere else (Docker, App Runner, ECS).
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /srv
COPY requirements.txt .
RUN pip install -r requirements.txt

# Public AWS RDS CA bundle (not a secret) for DB_SSLMODE=verify-full.
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem', '/srv/global-bundle.pem')"

COPY app ./app
COPY scripts ./scripts
COPY sql ./sql

RUN useradd --create-home --uid 10001 appuser
USER appuser

ENV APP_ENV=production DB_CA_PATH=/srv/global-bundle.pem DB_SSLMODE=verify-full
EXPOSE 8080
# One process per instance; the in-process worker coordinates with other instances via PostgreSQL row locks.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
