const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const COOKIES_FILE = path.join(__dirname, 'cookies.json');

// Configuration Puppeteer optimisée
const browserConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1920,1080'
  ],
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
};

// Fonction pour sauvegarder les cookies
async function saveCookies(cookies) {
  try {
    await fs.writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log('Cookies sauvegardés');
  } catch (error) {
    console.error('Erreur sauvegarde cookies:', error);
  }
}

// Fonction pour charger les cookies
async function loadCookies() {
  try {
    const cookiesData = await fs.readFile(COOKIES_FILE, 'utf8');
    return JSON.parse(cookiesData);
  } catch (error) {
    console.log('Pas de cookies existants');
    return null;
  }
}

// Fonction d'extraction avancée des contacts
function extractContactsAdvanced(text) {
  // Nettoyer le texte
  const cleanText = text.replace(/\s+/g, ' ').toLowerCase();
  
  // Patterns pour téléphones français (plus robustes)
  const phonePatterns = [
    // Format international
    /(?:\+33|0033)\s?[1-9](?:[\s.-]?\d{2}){4}/g,
    // Format national avec séparateurs
    /0[1-9](?:[\s.-]?\d{2}){4}/g,
    // Format sans séparateurs
    /0[1-9]\d{8}/g,
    // Avec parenthèses
    /0[1-9]\s?\(\d{2}\)\s?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/g,
    // Format court parfois utilisé
    /(?:tél|tel|téléphone|phone|mobile|portable)[\s:]+?(0[1-9][\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})/gi
  ];
  
  // Patterns pour emails
  const emailPatterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    /[a-zA-Z0-9._%+-]+\s?(?:arobase|at)\s?[a-zA-Z0-9.-]+\s?(?:point|dot)\s?[a-zA-Z]{2,}/gi
  ];
  
  let phones = new Set();
  let emails = new Set();
  
  // Extraire téléphones
  phonePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => {
      // Normaliser le numéro
      let normalized = match.replace(/[^\d+]/g, '');
      if (normalized.startsWith('33')) {
        normalized = '0' + normalized.slice(2);
      }
      if (normalized.length === 10 && normalized.startsWith('0')) {
        phones.add(normalized);
      }
    });
  });
  
  // Extraire emails
  emailPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => {
      // Nettoyer l'email
      let email = match.toLowerCase()
        .replace(/\s?arobase\s?/gi, '@')
        .replace(/\s?point\s?/gi, '.')
        .replace(/\s+/g, '');
      
      // Valider format basique
      if (email.includes('@') && email.includes('.')) {
        emails.add(email);
      }
    });
  });
  
  return {
    phones: Array.from(phones),
    emails: Array.from(emails)
  };
}

// Fonction principale de scraping avec cookies
async function scrapeLeBonCoinWithCookies(url) {
  let browser;
  try {
    browser = await puppeteer.launch(browserConfig);
    const page = await browser.newPage();
    
    // Configuration du navigateur
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Anti-détection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      window.chrome = { runtime: {} };
    });
    
    // Charger les cookies s'ils existent
    const savedCookies = await loadCookies();
    if (savedCookies) {
      console.log('Chargement des cookies existants...');
      await page.setCookie(...savedCookies);
    }
    
    console.log('Navigation vers:', url);
    
    // Navigation avec gestion d'erreurs
    try {
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
    } catch (navError) {
      console.log('Erreur navigation, tentative avec waitUntil: domcontentloaded');
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
    }
    
    // Attendre le chargement
    await page.waitForTimeout(3000);
    
    // Sauvegarder les nouveaux cookies
    const cookies = await page.cookies();
    await saveCookies(cookies);
    
    // Vérifier si on est bloqué
    const pageContent = await page.content();
    const isBlocked = pageContent.toLowerCase().includes('cloudflare') || 
                      pageContent.includes('Access denied');
    
    if (isBlocked) {
      console.log('Page bloquée détectée, attente...');
      await page.waitForTimeout(5000);
    }
    
    // Extraction des données selon le type de page
    let result = {
      success: true,
      url: url,
      timestamp: new Date().toISOString()
    };
    
    // Si c'est une page d'annonce individuelle
    if (url.includes('/ad/') || url.includes('/voitures/')) {
      console.log('Scraping annonce individuelle...');
      
      // Essayer de cliquer sur le bouton téléphone si présent
      try {
        const phoneButton = await page.$('[data-qa-id="adview_contact_phone_button"]');
        if (phoneButton) {
          console.log('Bouton téléphone trouvé, clic...');
          await phoneButton.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        console.log('Pas de bouton téléphone ou erreur clic');
      }
      
      // Extraire toutes les données
      const annonceData = await page.evaluate(() => {
        // Titre
        const titleEl = document.querySelector('h1') || 
                       document.querySelector('[data-qa-id="adview_title"]');
        const title = titleEl ? titleEl.innerText : '';
        
        // Prix
        const priceEl = document.querySelector('[data-qa-id="adview_price"]') ||
                       document.querySelector('[data-test-id="price"]');
        const price = priceEl ? priceEl.innerText : '';
        
        // Description
        const descEl = document.querySelector('[data-qa-id="adview_description_container"]') ||
                      document.querySelector('[data-test-id="description"]');
        const description = descEl ? descEl.innerText : '';
        
        // Vendeur
        const sellerEl = document.querySelector('[data-qa-id="adview_profile_name"]');
        const sellerName = sellerEl ? sellerEl.innerText : '';
        
        // Localisation
        const locationEl = document.querySelector('[data-qa-id="adview_location"]');
        const location = locationEl ? locationEl.innerText : '';
        
        // Numéro affiché après clic
        const phoneEl = document.querySelector('[data-qa-id="adview_contact_phone_number"]');
        const phoneFromButton = phoneEl ? phoneEl.innerText : '';
        
        // Tout le texte de la page pour extraction
        const fullText = document.body.innerText;
        
        return {
          title,
          price,
          description,
          sellerName,
          location,
          phoneFromButton,
          fullText
        };
      });
      
      // Extraire les contacts du texte complet
      const contacts = extractContactsAdvanced(annonceData.fullText);
      
      // Si on a trouvé un numéro via le bouton, l'ajouter
      if (annonceData.phoneFromButton) {
        const cleanPhone = annonceData.phoneFromButton.replace(/[^\d]/g, '');
        if (cleanPhone.length === 10) {
          contacts.phones.unshift(cleanPhone);
        }
      }
      
      result = {
        ...result,
        type: 'annonce',
        data: {
          title: annonceData.title,
          price: annonceData.price,
          location: annonceData.location,
          sellerName: annonceData.sellerName,
          description: annonceData.description.substring(0, 500) + '...',
          contacts: {
            phones: [...new Set(contacts.phones)],
            emails: [...new Set(contacts.emails)]
          }
        },
        html: pageContent
      };
      
    } else if (url.includes('/recherche') || url.includes('text=')) {
      // Page de recherche
      console.log('Scraping page de recherche...');
      
      const annonces = await page.evaluate(() => {
        const items = [];
        const selectors = [
          'a[data-test-id="ad"]',
          '[data-qa-id="aditem_container"]',
          'article[data-test-id="ad"]'
        ];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach(el => {
              const link = el.href || el.querySelector('a')?.href;
              const title = el.querySelector('[data-test-id="ad-title"]')?.innerText || '';
              const price = el.querySelector('[data-test-id="price"]')?.innerText || '';
              const location = el.querySelector('[data-test-id="ad-location"]')?.innerText || '';
              
              if (link && title) {
                items.push({ title, price, location, link });
              }
            });
            break;
          }
        }
        
        return items;
      });
      
      result = {
        ...result,
        type: 'recherche',
        nombreAnnonces: annonces.length,
        annonces: annonces
      };
    }
    
    await browser.close();
    return result;
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('Erreur scraping:', error);
    throw error;
  }
}

// Routes API

// Route principale
app.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ 
        error: 'URL invalide. Fournissez une URL leboncoin.fr' 
      });
    }
    
    console.log(`[${new Date().toISOString()}] Scraping: ${url}`);
    const result = await scrapeLeBonCoinWithCookies(url);
    
    console.log('Scraping terminé avec succès');
    res.json(result);
    
  } catch (error) {
    console.error('Erreur:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Route pour réinitialiser les cookies
app.post('/reset-cookies', async (req, res) => {
  try {
    await fs.unlink(COOKIES_FILE);
    res.json({ message: 'Cookies supprimés' });
  } catch (error) {
    res.json({ message: 'Pas de cookies à supprimer' });
  }
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'LeBonCoin Scraper Pro',
    version: '2.0.0',
    features: ['cookies', 'anti-detection', 'contacts-extraction'],
    timestamp: new Date().toISOString()
  });
});

// Route d'accueil
app.get('/', (req, res) => {
  res.json({
    service: 'LeBonCoin Scraper Pro',
    endpoints: {
      'POST /scrape': 'Scraper une page (annonce ou recherche)',
      'POST /reset-cookies': 'Réinitialiser les cookies',
      'GET /health': 'Statut du service'
    },
    exemple: {
      url: '/scrape',
      method: 'POST',
      body: {
        url: 'https://www.leboncoin.fr/ad/voitures/2990778250'
      }
    }
  });
});

// Démarrage
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LeBonCoin Scraper Pro démarré sur le port ${PORT}`);
  console.log(`URL: http://0.0.0.0:${PORT}`);
});
