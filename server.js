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

async function scrapeAnnonce(url) {
  try {
    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);
    
    const data = {
      url: url,
      title: $('h1').first().text().trim(),
      price: $('[data-test-id="price"]').text().trim(),
      description: $('[data-test-id="description"]').text().trim(),
      location: $('[data-test-id="location"]').text().trim(),
      seller: $('[data-test-id="seller-name"]').text().trim(),
      phoneNumber: null,
      email: null
    };

    const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
    const phoneMatches = data.description.match(phoneRegex);
    if (phoneMatches && phoneMatches.length > 0) {
      data.phoneNumber = phoneMatches[0].replace(/[\s.-]/g, '');
    }

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = data.description.match(emailRegex);
    if (emailMatches && emailMatches.length > 0) {
      data.email = emailMatches[0];
    }

    return data;
  } catch (error) {
    console.error('Erreur:', error.message);
    throw error;
  }
}

app.post('/scrape/annonce', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !url.includes('leboncoin.fr')) {
      return res.status(400).json({ error: 'URL invalide' });
    }

    const data = await scrapeA