const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Render fournit le PORT
const PORT = process.env.PORT || 10000;

// Configuration Puppeteer pour Render
const browserConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
    '--no-zygote'
  ]
};

// Fonction de scraping avancée
async function scrapeLeBonCoin(url) {
  let browser;
  try {
    browser = await puppeteer.launch(browserConfig);
    const page = await browser.newPage();
    
    // Configuration avancée
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Éviter la détection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' })
        })
      });
    });
    
    // Intercepter les requêtes inutiles
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Navigation avec gestion des erreurs
    console.log('Navigation vers:', url);
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    // Attendre que la page soit chargée
    await page.waitForTimeout(3000);
    
    // Vérifier si on est bloqué
    const isBlocked = await page.evaluate(() => {
      return document.body.textContent.includes('Access denied') || 
             document.title.includes('Attention Required');
    });
    
    if (isBlocked) {
      console.log('Détection Cloudflare, tentative de contournement...');
      await page.waitForTimeout(5000);
    }
    
    // Extraire les données
    const data = await page.evaluate(() => {
      const annonces = [];
      
      // Sélecteurs multiples pour plus de robustesse
      const selectors = [
        'a[data-test-id="ad"]',
        '[data-test-id="ad-card"]',
        '.styles_adCard__HQRFN',
        'a[href*="/ad/"]',
        '[data-qa-id="aditem_container"]',
        'article[data-test-id="ad"]',
        '[data-test-id="aditem"]'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const titleEl = el.querySelector('[data-test-id="ad-title"], .styles_title__HQRFN, h3, [data-qa-id="aditem_title"], p[data-test-id="ad-title"]');
            const priceEl = el.querySelector('[data-test-id="price"], .styles_price__HQRFN, [data-qa-id="aditem_price"], span[data-test-id="price"]');
            const locationEl = el.querySelector('[data-test-id="location"], .styles_location__HQRFN, [data-qa-id="aditem_location"], p[data-test-id="ad-location"]');
            const link = el.href || el.querySelector('a')?.href;
            
            if (titleEl && link) {
              // Extraire le numéro de l'annonce
              const idMatch = link.match(/\/(\d{9,})\.htm/);
              const id = idMatch ? idMatch[1] : null;
              
              // Extraire le numéro de téléphone si visible dans le titre ou ailleurs
              const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
              const textContent = el.textContent || '';
              const phoneMatches = textContent.match(phoneRegex);
              
              annonces.push({
                id: id,
                titre: titleEl.textContent.trim(),
                prix: priceEl ? priceEl.textContent.trim() : 'Prix non spécifié',
                localisation: locationEl ? locationEl.textContent.trim() : '',
                lien: link.includes('http') ? link : `https://www.leboncoin.fr${link}`,
                numeroTelephone: phoneMatches ? phoneMatches[0] : null
              });
            }
          });
          break;
        }
      }
      
      return {
        annonces: annonces,
        pageTitle: document.title,
        hasCloudflare: document.body.textContent.includes('Cloudflare'),
        totalResultsText: document.querySelector('[data-test-id="total-results"]')?.textContent || ''
      };
    });
    
    await browser.close();
    
    return {
      success: true,
      url: url,
      nombreAnnonces: data.annonces.length,
      annonces: data.annonces,
      pageTitle: data.pageTitle,
      hasCloudflare: data.hasCloudflare,
      totalResults: data.totalResultsText,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur scraping:', error);
    throw error;
  }
}

// Route principale pour scraper
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ error: 'URL Le Bon Coin invalide' });
    }
    
    console.log(`[${new Date().toISOString()}] Scraping: ${url}`);
    const data = await scrapeLeBonCoin(url);
    res.json(data);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erreur:`, error.message);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'LeBonCoin Scraper'
  });
});

// Route d'accueil
app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper API',
    version: '7.0.0',
    endpoints: {
      'POST /scrape': 'Scraper une page Le Bon Coin',
      'GET /health': 'Vérifier le statut du service'
    },
    usage: {
      method: 'POST',
      url: '/scrape',
      body: {
        url: 'https://www.leboncoin.fr/recherche?text=...'
      }
    },
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Scraper API démarrée sur le port ${PORT}`);
  console.log(`URL: http://0.0.0.0:${PORT}`);
});
