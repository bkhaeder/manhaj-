FROM python:3.12-slim-bookworm

# LibreOffice لتحويل Word إلى PDF + خطوط عربية
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-writer-nogui fonts-hosny-amiri fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*
COPY deploy/fonts.conf /etc/fonts/local.conf
RUN fc-cache -f

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV PORT=10000 PYTHONUNBUFFERED=1
CMD gunicorn -w 1 --threads 8 --timeout 120 -b 0.0.0.0:$PORT app:app
