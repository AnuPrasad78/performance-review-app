# Performance Review API — one image, two roles on Azure Container Apps:
#   * the API container app runs the default CMD (uvicorn);
#   * the migration job runs the same image with `alembic upgrade head`,
#     so the code that migrates is always the code that will serve.
#
# Built in Azure by scripts/azure/deploy.sh (`az acr build`), or locally from
# backend/:  docker build -t performance-review-api .

FROM python:3.13-slim AS build

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --requirement /tmp/requirements.txt


FROM python:3.13-slim AS runtime

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Uvicorn worker processes per replica. Scale out with replicas first;
    # every worker holds its own connection pool (see docs/deployment.md).
    WEB_CONCURRENCY=2 \
    # Trust store for `?ssl=verify-full` database URLs. asyncpg otherwise
    # looks for ~/.postgresql/root.crt (this user has no home) and refuses;
    # the system bundle holds the roots Azure Database for PostgreSQL uses.
    PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

COPY --from=build /opt/venv /opt/venv

WORKDIR /srv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER 10001:10001
EXPOSE 8000

# --proxy-headers: ACA terminates TLS at its ingress and forwards the original
# scheme/client in X-Forwarded-*; the app sits on a private network behind it.
# Shell form so WEB_CONCURRENCY expands; exec keeps uvicorn as PID 1 so
# SIGTERM from a revision rollout drains requests gracefully.
CMD exec uvicorn app.main:create_app --factory \
    --host 0.0.0.0 --port 8000 \
    --workers "${WEB_CONCURRENCY}" \
    --proxy-headers --forwarded-allow-ips="*" \
    --timeout-graceful-shutdown 20
