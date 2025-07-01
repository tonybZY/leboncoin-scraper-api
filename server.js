const express = require('express');
const playwright = require('playwright');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Fonction pour scraper avec Playwright
async function scrapeLeBonCoin(url) {
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    // Aller sur la page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Attendre un peu
    await page.waitForTimeout(3000);
    
    // Extraire le HTML complet
    const html = await page.content();
    
    // Extraire les annonces
    const annonces = await page.$$eval('[data-test-id="ad"]', elements => {
      return elements.map(el => {
        const title = el.querySelector('[data-test-id="ad-title"]')?.textContent?.trim() || '';
        const price = el.querySelector('[data-test-id="price"]')?.textContent?.trim() || '';
        const location = el.querySelector('[data-test-id="location"]')?.textContent?.trim() || '';
        const link = el.querySelector('a')?.href || '';
        
        return { title, price, location, link };
      });
    });

    await browser.close();
    
    return {
      success: true,
      url: url,
      nombreAnnonces: annonces.length,
      annonces: annonces,
      htmlLength: html.length
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

    console.log('Scraping:', url);
    const data = await scrapeLeBonCoin(url);
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper avec Playwright',
    endpoints: {
      'POST /scrape': 'Scraper Le Bon Coin'
    }
  });
});

app.listen(PORT, () => {
  console.log(`API démarrée sur le port ${PORT}`);
});
