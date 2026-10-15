FROM python:3.13-alpine
WORKDIR /app
COPY cleanup.py .
USER 65534:65534
CMD ["python", "-u", "cleanup.py"]
