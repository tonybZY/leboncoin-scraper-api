const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Render fournit le PORT
const PORT = process.env.PORT || 10000;

// Configuration Puppeteer optimisée pour Render
const browserConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
    '--no-zygote',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-blink-features=AutomationControlled'
  ],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
};

// Fonction pour extraire emails et téléphones d'un texte
function extractContactInfo(text) {
  // Patterns pour les numéros de téléphone français
  const phonePatterns = [
    /(?:(?:\+|00)33[\s.-]?(?:\(0\))?|0)[1-9](?:[\s.-]?\d{2}){4}/g,
    /0[1-9](?:[0-9]{2}){4}/g,
    /(?:\+33|0033)[1-9]\d{8}/g
  ];
  
  // Pattern pour les emails
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  
  let phones = [];
  let emails = [];
  
  // Extraire les téléphones
  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      phones.push(...matches);
    }
  });
  
  // Extraire les emails
  const emailMatches = text.match(emailPattern);
  if (emailMatches) {
    emails.push(...emailMatches);
  }
  
  // Nettoyer et dédupliquer
  phones = [...new Set(phones.map(p => p.replace(/[\s.-]/g, '')))];
  emails = [...new Set(emails.map(e => e.toLowerCase()))];
  
  return { phones, emails };
}

// Fonction pour scraper une annonce individuelle
async function scrapeAnnonceDetail(page, url) {
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000);
    
    const details = await page.evaluate(() => {
      // Récupérer tout le texte de la page
      const pageText = document.body.innerText || '';
      
      // Essayer de trouver le bouton téléphone
      const phoneButton = document.querySelector('[data-qa-id="adview_contact_phone_button"]');
      
      // Récupérer la description
      const description = document.querySelector('[data-qa-id="adview_description_container"]')?.innerText || '';
      
      // Récupérer le nom du vendeur
      const sellerName = document.querySelector('[data-qa-id="adview_profile_name"]')?.innerText || '';
      
      return {
        pageText,
        description,
        sellerName,
        hasPhoneButton: !!phoneButton
      };
    });
    
    // Si il y a un bouton téléphone, essayer de cliquer dessus
    if (details.hasPhoneButton) {
      try {
        await page.click('[data-qa-id="adview_contact_phone_button"]');
        await page.waitForTimeout(2000);
        
        // Récupérer le numéro après le clic
        const phoneNumber = await page.evaluate(() => {
          const phoneEl = document.querySelector('[data-qa-id="adview_contact_phone_number"]');
          return phoneEl ? phoneEl.innerText : null;
        });
        
        if (phoneNumber) {
          details.phoneFromButton = phoneNumber;
        }
      } catch (e) {
        console.log('Impossible de cliquer sur le bouton téléphone');
      }
    }
    
    return details;
  } catch (error) {
    console.error('Erreur lors du scraping de l\'annonce:', error);
    return null;
  }
}

// Fonction de scraping principale
async function scrapeLeBonCoin(url, options = {}) {
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
      window.chrome = { runtime: {} };
    });
    
    console.log('Navigation vers:', url);
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    await page.waitForTimeout(3000);
    
    // Si c'est une page de recherche
    if (url.includes('/recherche') || url.includes('text=')) {
      const data = await page.evaluate(() => {
        const annonces = [];
        
        // Sélecteurs pour les annonces
        const selectors = [
          'a[data-test-id="ad"]',
          '[data-qa-id="aditem_container"]',
          'article[data-test-id="ad"]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach(el => {
              const titleEl = el.querySelector('[data-test-id="ad-title"], [data-qa-id="aditem_title"]');
              const priceEl = el.querySelector('[data-test-id="price"], [data-qa-id="aditem_price"]');
              const locationEl = el.querySelector('[data-test-id="ad-location"], [data-qa-id="aditem_location"]');
              const link = el.href || el.querySelector('a')?.href;
              
              if (titleEl && link) {
                annonces.push({
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
        
        return annonces;
      });
      
      // Si demandé, scraper les détails de chaque annonce
      if (options.scrapeDetails && data.length > 0) {
        const limit = Math.min(data.length, options.maxDetails || 5);
        
        for (let i = 0; i < limit; i++) {
          console.log(`Scraping détails annonce ${i + 1}/${limit}`);
          const details = await scrapeAnnonceDetail(page, data[i].lien);
          
          if (details) {
            const contactInfo = extractContactInfo(
              details.pageText + ' ' + details.description
            );
            
            data[i].details = {
              ...contactInfo,
              sellerName: details.sellerName,
              phoneFromButton: details.phoneFromButton
            };
          }
          
          // Pause entre les requêtes
          await page.waitForTimeout(2000);
        }
      }
      
      await browser.close();
      
      return {
        success: true,
        url: url,
        nombreAnnonces: data.length,
        annonces: data,
        timestamp: new Date().toISOString()
      };
      
    } else {
      // Si c'est une annonce individuelle
      const details = await scrapeAnnonceDetail(page, url);
      const contactInfo = details ? extractContactInfo(
        details.pageText + ' ' + details.description
      ) : { phones: [], emails: [] };
      
      await browser.close();
      
      return {
        success: true,
        url: url,
        type: 'annonce_individuelle',
        details: {
          ...contactInfo,
          sellerName: details?.sellerName,
          phoneFromButton: details?.phoneFromButton
        },
        timestamp: new Date().toISOString()
      };
    }
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur scraping:', error);
    throw error;
  }
}

// Middleware de logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Body:', req.body);
  }
  next();
});

// Route principale pour scraper
app.post('/scrape', async (req, res) => {
  try {
    const { url, scrapeDetails = false, maxDetails = 5 } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ error: 'URL Le Bon Coin invalide' });
    }
    
    console.log(`Début du scraping: ${url}`);
    const data = await scrapeLeBonCoin(url, { scrapeDetails, maxDetails });
    
    console.log(`Scraping terminé: ${data.nombreAnnonces || 1} résultat(s)`);
    res.json(data);
    
  } catch (error) {
    console.error('Erreur:', error.message);
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
    service: 'LeBonCoin Scraper Enhanced',
    features: ['emails', 'phones', 'details']
  });
});

// Route d'accueil
app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper API Enhanced',
    version: '8.0.0',
    endpoints: {
      'POST /scrape': 'Scraper une page Le Bon Coin',
      'GET /health': 'Vérifier le statut du service'
    },
    usage: {
      method: 'POST',
      url: '/scrape',
      body: {
        url: 'https://www.leboncoin.fr/recherche?text=...',
        scrapeDetails: true,  // Optionnel: récupérer emails/téléphones
        maxDetails: 5         // Optionnel: nombre max d'annonces à détailler
      }
    },
    features: [
      'Extraction des annonces',
      'Extraction des emails',
      'Extraction des numéros de téléphone',
      'Scraping des détails individuels'
    ],
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Route 404
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint non trouvé',
    availableEndpoints: ['GET /', 'GET /health', 'POST /scrape']
  });
});

// Démarrage du serveur
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] 🚀 Scraper API démarrée sur le port ${PORT}`);
  console.log(`URL locale: http://0.0.0.0:${PORT}`);
  console.log('Endpoints disponibles:');
  console.log('  - GET  / (infos)');
  console.log('  - GET  /health (santé)');
  console.log('  - POST /scrape (scraper)');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, fermeture...');
  server.close(() => {
    console.log('Serveur fermé');
    process.exit(0);
  });
});
