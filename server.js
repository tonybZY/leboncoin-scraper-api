// Configuration Puppeteer VRAIMENT optimisée
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Utiliser le plugin stealth (à installer : npm install puppeteer-extra puppeteer-extra-plugin-stealth)
puppeteer.use(StealthPlugin());

// Configuration avancée
const browserConfig = {
  headless: false, // Mettre true en production, false pour débugger
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080',
    '--start-maximized',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ],
  defaultViewport: null,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
};

// Fonction avancée de scraping avec contournement
async function scrapeWithBypass(url) {
  let browser;
  try {
    browser = await puppeteer.launch(browserConfig);
    const page = await browser.newPage();
    
    // Injection de scripts anti-détection avancés
    await page.evaluateOnNewDocument(() => {
      // Override de nombreuses propriétés
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Mock Chrome
      window.navigator.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin' },
          { name: 'Chrome PDF Viewer' },
          { name: 'Native Client' }
        ]
      });
      
      // Languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['fr-FR', 'fr', 'en-US', 'en']
      });
      
      // WebGL Vendor
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter(parameter);
      };
    });
    
    // Cookies et headers réalistes
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Comportement humain simulé
    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100),
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });
    
    console.log('Navigation avec comportement humain...');
    
    // Navigation progressive
    await page.goto('https://www.leboncoin.fr', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Attendre comme un humain
    await page.waitForTimeout(2000 + Math.random() * 2000);
    
    // Mouvement de souris aléatoire
    await page.mouse.move(
      Math.random() * 1920,
      Math.random() * 1080
    );
    
    // Maintenant naviguer vers l'URL cible
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    // Attendre et scroller comme un humain
    await page.waitForTimeout(3000 + Math.random() * 2000);
    
    // Scroll progressif
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Attendre que tout soit chargé
    await page.waitForTimeout(2000);
    
    // Vérifier si on est bloqué
    const isBlocked = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('access denied') || 
             text.includes('cloudflare') ||
             text.includes('checking your browser');
    });
    
    if (isBlocked) {
      console.log('Détection Cloudflare... Attente...');
      await page.waitForTimeout(10000);
      
      // Réessayer de récupérer le contenu
      const html = await page.content();
      const newBlocked = html.toLowerCase().includes('cloudflare');
      
      if (newBlocked) {
        throw new Error('Bloqué par Cloudflare même après attente');
      }
    }
    
    // Récupérer le HTML final
    const html = await page.content();
    const cookies = await page.cookies();
    
    // Screenshot pour debug (optionnel)
    // await page.screenshot({ path: 'debug.png', fullPage: true });
    
    await browser.close();
    
    return {
      success: true,
      html: html,
      htmlLength: html.length,
      cookies: cookies,
      blocked: false
    };
    
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

// Alternative : Utiliser un proxy résidentiel
async function scrapeWithProxy(url, proxyUrl) {
  const browser = await puppeteer.launch({
    ...browserConfig,
    args: [
      ...browserConfig.args,
      `--proxy-server=${proxyUrl}`
    ]
  });
  
  // Suite du code...
}

// Alternative : Utiliser playwright (plus difficile à détecter)
// npm install playwright
const { chromium } = require('playwright');

async function scrapeWithPlaywright(url) {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris'
  });
  
  const page = await context.newPage();
  
  // Injection anti-détection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });
  
  await page.goto(url);
  const html = await page.content();
  
  await browser.close();
  return html;
}
