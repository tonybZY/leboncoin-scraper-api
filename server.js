const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Fonction pour scraper avec Puppeteer
async function scrapeLeBonCoin(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Bloquer les images pour aller plus vite
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font'){
        req.abort();
      } else {
        req.continue();
      }
    });

    // Aller sur la page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Attendre que les annonces se chargent
    await page.waitForSelector('[data-test-id="ad"]', { timeout: 10000 });
    
    // Extraire les données
    const annonces = await page.evaluate(() => {
      const results = [];
      const items = document.querySelectorAll('[data-test-id="ad"]');
      
      items.forEach(item => {
        const titleEl = item.querySelector('[data-test-id="ad-title"]');
        const priceEl = item.querySelector('[data-test-id="price"]');
        const locationEl = item.querySelector('[data-test-id="location"]');
        const linkEl = item.querySelector('a');
        const imageEl = item.querySelector('img');
        
        if (titleEl && linkEl) {
          results.push({
            titre: titleEl.innerText.trim(),
            prix: priceEl ? priceEl.innerText.trim() : 'Prix non spécifié',
            localisation: locationEl ? locationEl.innerText.trim() : '',
            lien: linkEl.href,
            image: imageEl ? imageEl.src : '',
            // Chercher le numéro dans le titre ou la description
            numeroVisible: null
          });
        }
      });
      
      return results;
    });

    await browser.close();
    
    return {
      success: true,
      url: url,
      nombreAnnonces: annonces.length,
      annonces: annonces
    };
    
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Route pour scraper
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ error: 'URL Le Bon Coin invalide' });
    }

    const data = await scrapeLeBonCoin(url);
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper API avec Puppeteer',
    endpoints: {
      'POST /scrape': 'Scraper Le Bon Coin (recherche ou annonce)'
    }
  });
});

app.listen(PORT, () => {
  console.log(`API démarrée sur le port ${PORT}`);
});
