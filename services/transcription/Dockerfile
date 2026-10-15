FROM python:3.11-slim
WORKDIR /app
COPY services/transcription/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/transcription/*.py ./
RUN useradd -m worker && mkdir /models && chown worker /models
USER worker
ENV WHISPER_DEVICE=cpu WHISPER_COMPUTE_TYPE=int8 WHISPER_CPU_THREADS=4
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "8", "--no-access-log"]
