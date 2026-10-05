FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY arcana ./arcana
COPY server ./server
ENV ARCANA_HOSTED=1 PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["python", "server/server.py"]
