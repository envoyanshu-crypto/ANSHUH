# Sendra Boots Web Scraper

This directory contains web scrapers for extracting product data from the Sendra Boots website (https://sendra.com/en) for RAG (Retrieval Augmented Generation) ingestion.

## Overview

The scraper extracts the following information from Sendra Boots:
- Product name
- Description
- Price and currency
- Product images (URLs)
- Category
- Availability status
- Product URL

## Files

### 1. `sendra-boots-scraper.ts`
Basic scraper using axios and cheerio. Lightweight but may be blocked by bot protection.

### 2. `sendra-boots-playwright.ts` (Recommended)
Advanced scraper using Playwright with headless browser automation. Better at handling JavaScript-heavy sites and bot protection.

## Installation

All dependencies are already installed via the main package.json:
```bash
npm install
```

## Usage

### Option 1: Playwright Scraper (Recommended)
```bash
npm run scrape:sendra:playwright
```

### Option 2: Basic Scraper
```bash
npm run scrape:sendra
```

## Output Files

The scraper generates several output files in the `data/` directory:

### 1. `sendra-boots-all.json`
Complete product catalog in structured JSON format.

### 2. `sendra-boots-{category}.json`
Products grouped by category (hombre, mujer, cowboy-hombre, etc.).

### 3. `sendra-boots-rag.json`
RAG-optimized format with content and metadata structured for vector embeddings:
```json
{
  "content": "Product description and details as text",
  "metadata": {
    "id": "product-id",
    "name": "Product Name",
    "price": "199.99",
    "currency": "EUR",
    "category": "hombre",
    "url": "https://sendra.com/en/products/...",
    "images": ["image1.jpg", "image2.jpg"],
    "type": "product"
  }
}
```

### 4. `sendra-boots-rag.txt`
Plain text format with all product information, ideal for simple RAG ingestion.

### 5. `scrape-summary.json`
Summary statistics about the scraping session.

## Bot Protection Challenges

The Sendra Boots website uses strong bot protection (likely Cloudflare or similar). If you encounter issues:

### Solutions:

#### 1. Run with Visible Browser
Edit `sendra-boots-playwright.ts` and set:
```typescript
headless: false
```
This allows you to manually solve captchas if needed.

#### 2. Add Delays
Increase the delay between requests:
```typescript
delay: 3000  // 3 seconds
```

#### 3. Use Proxy/VPN
If your IP is blocked, consider using a proxy service.

#### 4. Run Locally
The scraper may work better on a local machine with full browser support rather than in a cloud/sandbox environment.

## Configuration

Edit the scraper file to customize:

```typescript
const config: ScraperConfig = {
  baseUrl: 'https://sendra.com/en',
  collections: [
    'hombre',        // Men's boots
    'mujer',         // Women's boots
    'cowboy-hombre', // Men's cowboy boots
    'biker-hombre',  // Men's biker boots
    'biker-mujer'    // Women's biker boots
  ],
  outputDir: path.join(process.cwd(), 'data'),
  delay: 1500,      // Milliseconds between requests
  headless: true    // Set to false to see browser
};
```

## For RAG Ingestion

### Using with Vector Databases

#### Supabase/PostgreSQL with pgvector:
```sql
CREATE TABLE product_embeddings (
  id UUID PRIMARY KEY,
  content TEXT,
  embedding VECTOR(1536),
  metadata JSONB
);
```

Then ingest the `sendra-boots-rag.json` file:
```typescript
import data from './data/sendra-boots-rag.json';

for (const item of data) {
  const embedding = await generateEmbedding(item.content);
  await supabase.from('product_embeddings').insert({
    content: item.content,
    embedding: embedding,
    metadata: item.metadata
  });
}
```

#### Using with LangChain:
```typescript
import { Document } from 'langchain/document';
import data from './data/sendra-boots-rag.json';

const documents = data.map(item => new Document({
  pageContent: item.content,
  metadata: item.metadata
}));

// Add to vector store
await vectorStore.addDocuments(documents);
```

## Troubleshooting

### Issue: 403 Forbidden
**Solution:** The site is blocking automated requests. Try:
- Running with `headless: false`
- Increasing delays between requests
- Using a different IP/proxy

### Issue: Page Crashed
**Solution:** Browser environment issue. Try:
- Running on a local machine with proper browser support
- Installing Chromium manually: `npx playwright install chromium`
- Using a different browser: `firefox` or `webkit`

### Issue: No Products Found
**Solution:** Page structure may have changed. Inspect the selectors:
```typescript
// Update these selectors in the scraper
const productLinks = document.querySelectorAll('a[href*="/products/"]');
const name = document.querySelector('h1.product-title');
const price = document.querySelector('.product-price');
```

## Alternative: Manual Data Collection

If automated scraping continues to fail, you can manually structure data in the same format:

```json
[
  {
    "content": "Sendra 2073 Men's Cowboy Boots\n\nHandcrafted leather cowboy boots with traditional western styling...",
    "metadata": {
      "id": "sendra-2073",
      "name": "Sendra 2073 Men's Cowboy Boots",
      "price": "249.00",
      "currency": "EUR",
      "category": "cowboy-hombre",
      "url": "https://sendra.com/en/products/sendra-2073",
      "images": ["https://..."],
      "type": "product"
    }
  }
]
```

## Support

For issues with the scraper or RAG ingestion, check:
1. Network connectivity
2. Browser installation
3. Site structure changes
4. Bot protection updates

## License

This scraper is for personal/educational use only. Respect the website's robots.txt and terms of service.
