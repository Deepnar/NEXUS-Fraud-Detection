FROM python:3.12-slim

WORKDIR /app
COPY ml/requirements.txt /app/ml/requirements.txt
RUN pip install --no-cache-dir -r /app/ml/requirements.txt
COPY ml /app/ml

ENV PYTHONPATH=/app/ml
ENV MODEL_ARTIFACT_ROOT=/app/ml/artifacts
EXPOSE 8001

CMD ["uvicorn", "service:app", "--app-dir", "/app/ml", "--host", "0.0.0.0", "--port", "8001"]
