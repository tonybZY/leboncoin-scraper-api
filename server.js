const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Headers optimisés pour éviter la détection
const getHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Referer': 'https://www.google.com/'
});

// Fonction pour extraire les données du JSON dans la page
function extractDataFromHtml(html) {
  try {
    // Le Bon Coin met les données dans un script JSON
    const scriptMatch = html.match(/window\.FLUX_STATE\s*=\s*({.*?})\s*;/s);
    if (scriptMatch) {
      const jsonData = JSON.parse(scriptMatch[1]);
      return jsonData;
    }
    
    // Méthode alternative
    const dataMatch = html.match(/<script[^>]*>window\.__INITIAL_STATE__=({.*?})<\/script>/);
    if (dataMatch) {
      return JSON.parse(dataMatch[1]);
    }
    
    return null;
  } catch (error) {
    console.error('Erreur parsing JSON:', error);
    return null;
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
    
    // Ajouter un délai aléatoire
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    const response = await axios.get(url, {
      headers: getHeaders(),
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });
    
    if (response.status === 403) {
      return res.status(403).json({ 
        error: 'Accès refusé par Le Bon Coin',
        suggestion: 'Utilisez un service de proxy ou attendez quelques minutes'
      });
    }
    
    const html = response.data;
    const jsonData = extractDataFromHtml(html);
    
    // Extraire les annonces basiquement
    const annonceMatches = html.match(/<a[^>]*href="\/[^"]*\/(\d{10,})\.htm"[^>]*>.*?<\/a>/g) || [];
    const annonces = annonceMatches.map(match => {
      const idMatch = match.match(/\/(\d{10,})\.htm/);
      return {
        id: idMatch ? idMatch[1] : null,
        lien: `https://www.leboncoin.fr${match.match(/href="([^"]+)"/)[1]}`
      };
    }).filter(a => a.id);
    
    res.json({
      success: true,
      url: url,
      nombreAnnonces: annonces.length,
      annonces: annonces.slice(0, 20),
      hasData: !!jsonData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erreur:', error.message);
    res.status(500).json({ 
      error: error.message,
      type: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Route de test avec proxy
app.post('/scrape-with-proxy', async (req, res) => {
  res.json({
    message: 'Pour un scraping fiable, utilisez un service comme ScrapingBee ou Scrapfly',
    alternatives: [
      'https://scrapingbee.com - 1000 requêtes gratuites',
      'https://scrapfly.io - 1000 requêtes gratuites',
      'https://scraperapi.com - 1000 requêtes gratuites'
    ]
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper API',
    endpoints: {
      'POST /scrape': 'Scraper Le Bon Coin',
      'POST /scrape-with-proxy': 'Infos sur les proxies'
    },
    note: 'Le Bon Coin a des protections anti-scraping fortes'
  });
});

app.listen(PORT, () => {
  console.log(`API démarrée sur le port ${PORT}`);
});
