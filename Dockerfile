FROM ghcr.io/puppeteer/puppeteer:21.6.0

# Passer en utilisateur root pour installer les packages
USER root

# Installer seulement le strict nécessaire
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Créer le dossier de l'app
WORKDIR /app

# Copier les fichiers
COPY package*.json ./

# Installer les dépendances sans puppeteer (déjà dans l'image)
RUN npm install --only=production --ignore-scripts

# Copier le reste
COPY . .

# Retourner à l'utilisateur puppeteer
USER pptruser

# Exposer le port
EXPOSE 3000

# Démarrer
CMD ["node", "server.js"]
