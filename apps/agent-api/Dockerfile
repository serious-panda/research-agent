FROM python:3.12-slim
WORKDIR /app

RUN pip install poetry==1.8.3 && poetry config virtualenvs.create false

# Install packages/rag first (infrequent changes → good cache layer)
COPY packages/rag /packages/rag
RUN pip install /packages/rag

# Install agent-api deps
COPY apps/agent-api/pyproject.toml apps/agent-api/poetry.lock ./
RUN poetry install --no-interaction --no-root

# Copy source
COPY apps/agent-api/src ./src
COPY apps/agent-api/main.py .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
