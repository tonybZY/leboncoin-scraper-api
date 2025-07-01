const express = require('express');
const cors = require('cors');
// Puppeteer est déjà disponible dans l'image Docker
const puppeteer = require('/usr/local/share/.config/yarn/global/node_modules/puppeteer');

const app = express();
app.use(cors());
app.use(express.json());
// ... reste du code identique
const browserConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-accelerated-2d-canvas'
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
        'a[href*="/ad/"]'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const titleEl = el.querySelector('[data-test-id="ad-title"], .styles_title__HQRFN, h3');
            const priceEl = el.querySelector('[data-test-id="price"], .styles_price__HQRFN');
            const locationEl = el.querySelector('[data-test-id="location"], .styles_location__HQRFN');
            const link = el.href || el.querySelector('a')?.href;
            
            if (titleEl && link) {
              // Extraire le numéro de l'annonce
              const idMatch = link.match(/\/(\d{9,})\.htm/);
              const id = idMatch ? idMatch[1] : null;
              
              annonces.push({
                id: id,
                titre: titleEl.textContent.trim(),
                prix: priceEl ? priceEl.textContent.trim() : 'Prix non spécifié',
                localisation: locationEl ? locationEl.textContent.trim() : '',
                lien: link.includes('http') ? link : `https://www.leboncoin.fr${link}`
              });
            }
          });
          break;
        }
      }
      
      // Extraire aussi depuis le JSON de la page si disponible
      try {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          if (script.textContent.includes('window.FLUX_STATE')) {
            const match = script.textContent.match(/window\.FLUX_STATE\s*=\s*({.*?});/s);
            if (match) {
              const fluxData = JSON.parse(match[1]);
              console.log('FLUX_STATE trouvé');
            }
          }
        }
      } catch (e) {
        console.error('Erreur parsing FLUX_STATE:', e);
      }
      
      return {
        annonces: annonces,
        pageTitle: document.title,
        hasCloudflare: document.body.textContent.includes('Cloudflare')
      };
    });
    
    await browser.close();
    
    return {
      success: true,
      url: url,
      nombreAnnonces: data.annonces.length,
      annonces: data.annonces,
      pageTitle: data.pageTitle,
      hasCloudflare: data.hasCloudflare
    };
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur scraping:', error);
    throw error;
  }
}

// Route principale
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ error: 'URL Le Bon Coin invalide' });
    }
    
    const data = await scrapeLeBonCoin(url);
    res.json(data);
    
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper avec Puppeteer (Docker)',
    endpoints: {
      'POST /scrape': 'Scraper Le Bon Coin'
    },
    status: 'ready'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Scraper API démarrée sur le port ${PORT}`);
});
