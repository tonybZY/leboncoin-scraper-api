FROM ghcr.io/puppeteer/puppeteer:21.6.0

USER root

RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production --ignore-scripts

COPY . .

USER pptruser

EXPOSE 3000

CMD ["node", "server.js"]
