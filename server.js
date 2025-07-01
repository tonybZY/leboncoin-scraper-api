const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://www.leboncoin.fr';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
};

// Fonction pour scraper une page de recherche
async function scrapeSearch(url) {
  try {
    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);
    
    const annonces = [];
    
    // Sélecteur pour les cartes d'annonces
    $('[data-test-id="ad-card"]').each((i, elem) => {
      const $elem = $(elem);
      
      const titre = $elem.find('[data-test-id="ad-title"]').text().trim();
      const prix = $elem.find('[data-test-id="price"]').text().trim();
      const localisation = $elem.find('[data-test-id="location"]').text().trim();
      const lienElement = $elem.find('a').first();
      let lien = lienElement.attr('href');
      
      if (lien && !lien.startsWith('http')) {
        lien = `https://www.leboncoin.fr${lien}`;
      }
      
      if (titre && lien) {
        annonces.push({
          titre,
          prix,
          localisation,
          lien
        });
      }
    });
    
    return {
      url: url,
      nombreAnnonces: annonces.length,
      annonces: annonces
    };
  } catch (error) {
    console.error('Erreur:', error.message);
    throw error;
  }
}

// Nouvelle route pour scraper une recherche
app.post('/scrape/recherche', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr/recherche')) {
      return res.status(400).json({ error: 'URL de recherche invalide' });
    }

    const data = await scrapeSearch(url);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route existante pour une annonce
app.post('/scrape/annonce', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ error: 'URL invalide' });
    }

    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);
    
    const data = {
      url: url,
      title: $('h1').first().text().trim(),
      price: $('[data-test-id="price"]').text().trim(),
      description: $('[data-test-id="description"]').text().trim(),
      phoneNumber: null
    };

    const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
    const phoneMatches = data.description.match(phoneRegex);
    if (phoneMatches) {
      data.phoneNumber = phoneMatches[0].replace(/[\s.-]/g, '');
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper API',
    endpoints: {
      'POST /scrape/annonce': 'Scraper une annonce',
      'POST /scrape/recherche': 'Scraper une page de recherche'
    }
  });
});

app.listen(PORT, () => {
  console.log(`API démarrée sur le port ${PORT}`);
});
