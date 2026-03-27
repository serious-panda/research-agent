FROM python:3.12-slim
WORKDIR /app
RUN pip install poetry==1.8.3 && poetry config virtualenvs.create false
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-interaction --no-root
COPY src ./src
CMD ["python", "-m", "src.server"]
