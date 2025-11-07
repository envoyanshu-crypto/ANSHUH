import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

interface ProductData {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  localImages: string[];
  category: string;
  availability: string;
  url: string;
  metadata: {
    scrapedAt: string;
    source: string;
  };
}

interface RAGDocument {
  content: string;
  metadata: {
    id: string;
    name: string;
    price: string;
    currency: string;
    category: string;
    url: string;
    images: string[];
    localImages: string[];
    availability: string;
    type: string;
    source: string;
    scrapedAt: string;
  };
}

class CompleteSendraScraper {
  private browser: Browser | null = null;
  private products: ProductData[] = [];
  private baseUrl = 'https://sendra.com/en';
  private outputDir: string;
  private imagesDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.imagesDir = path.join(outputDir, 'images');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async initBrowser(): Promise<void> {
    console.log('🚀 Launching browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ]
    });
  }

  private async createStealthPage(): Promise<Page> {
    if (!this.browser) {
      await this.initBrowser();
    }

    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      ignoreHTTPSErrors: true,
      bypassCSP: true,
    });

    await context.addInitScript(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    const page = await context.newPage();
    return page;
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9-_.]/g, '_').substring(0, 100);
  }

  private async downloadImage(url: string, filepath: string): Promise<boolean> {
    try {
      if (fs.existsSync(filepath)) {
        return true;
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://sendra.com/',
        },
      });

      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await pipeline(response.data, createWriteStream(filepath));
      return true;
    } catch (error) {
      return false;
    }
  }

  private async scrapeProductDetails(page: Page, url: string, category: string): Promise<ProductData | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.delay(2000);

      const productData = await page.evaluate(() => {
        // Extract product name
        const nameSelectors = [
          'h1.product-title',
          'h1.product__title',
          '.product-single__title',
          'h1[itemprop="name"]',
          'h1',
        ];
        let name = '';
        for (const selector of nameSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent?.trim()) {
            name = el.textContent.trim();
            break;
          }
        }

        // Extract description
        const descSelectors = [
          '.product-description',
          '.product__description',
          '.product-single__description',
          '[itemprop="description"]',
          '.rte',
          '.product-content',
        ];
        let description = '';
        for (const selector of descSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent?.trim()) {
            description = el.textContent.trim();
            break;
          }
        }
        if (!description) {
          const metaDesc = document.querySelector('meta[name="description"]');
          description = metaDesc?.getAttribute('content') || '';
        }

        // Extract price
        const priceSelectors = [
          '.product-price',
          '.price',
          '.product__price',
          '[itemprop="price"]',
          '.money',
          '.price-item--regular',
        ];
        let priceText = '';
        for (const selector of priceSelectors) {
          const el = document.querySelector(selector);
          if (el?.textContent?.trim()) {
            priceText = el.textContent.trim();
            break;
          }
        }

        const price = priceText.replace(/[^\d.,]/g, '');
        const currencyMatch = priceText.match(/[€$£¥]/);
        const currency = currencyMatch ? currencyMatch[0] : 'EUR';

        // Extract ALL images
        const images: string[] = [];
        const imageSelectors = [
          'img[src*="product"]',
          '.product-image img',
          '.product__image img',
          '.product-gallery img',
          '[data-zoom]',
          '.product-media img',
          'img[alt*="product"]',
          'img[alt*="boot"]',
          'img[alt*="sendra"]',
        ];

        const seenUrls = new Set<string>();
        imageSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach((img) => {
            let src = img.getAttribute('src') ||
                     img.getAttribute('data-src') ||
                     img.getAttribute('data-srcset')?.split(' ')[0] || '';

            if (src) {
              if (src.startsWith('//')) {
                src = 'https:' + src;
              } else if (src.startsWith('/')) {
                src = window.location.origin + src;
              }

              // Remove size parameters to get full-size
              src = src.replace(/_(small|medium|large|compact|grande|\d+x\d*|x\d+)\./g, '.');
              src = src.split('?')[0]; // Remove query params

              if (src.includes('product') || src.includes('sendra') || src.includes('cdn')) {
                if (!seenUrls.has(src)) {
                  seenUrls.add(src);
                  images.push(src);
                }
              }
            }
          });
        });

        // Check availability
        const soldOutSelectors = ['.sold-out', '.out-of-stock', '.unavailable'];
        const isSoldOut = soldOutSelectors.some(sel => document.querySelector(sel));
        const hasAddToCart = document.querySelector('.add-to-cart, .product-form__submit, button[type="submit"]');
        const availability = isSoldOut ? 'Out of Stock' : (hasAddToCart ? 'In Stock' : 'Unknown');

        return { name, description, price, currency, images, availability };
      });

      if (!productData.name) {
        console.log(`    ✗ Could not extract product name`);
        return null;
      }

      const id = url.split('/').pop()?.split('?')[0] || `product-${Date.now()}`;

      // Download images
      console.log(`    📥 Downloading ${productData.images.length} images...`);
      const localImages: string[] = [];
      const productImageDir = path.join(this.imagesDir, this.sanitizeFilename(id));

      for (let i = 0; i < productData.images.length; i++) {
        const imageUrl = productData.images[i];
        const ext = imageUrl.match(/\.(jpg|jpeg|png|webp)$/i)?.[1] || 'jpg';
        const filename = `image-${i + 1}.${ext}`;
        const filepath = path.join(productImageDir, filename);
        const relativePath = path.relative(this.outputDir, filepath);

        const success = await this.downloadImage(imageUrl, filepath);
        if (success) {
          localImages.push(relativePath);
        }
        await this.delay(200);
      }

      console.log(`    ✓ Downloaded ${localImages.length}/${productData.images.length} images`);

      return {
        id,
        name: productData.name,
        description: productData.description,
        price: productData.price,
        currency: productData.currency,
        images: productData.images,
        localImages: localImages,
        url,
        category,
        availability: productData.availability,
        metadata: {
          scrapedAt: new Date().toISOString(),
          source: 'sendra.com',
        },
      };
    } catch (error: any) {
      console.log(`    ✗ Error: ${error.message}`);
      return null;
    }
  }

  private async scrapeCollection(collectionPath: string, category: string): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Collection: ${category}`);
    console.log(`${'='.repeat(60)}`);

    const page = await this.createStealthPage();

    try {
      const collectionUrl = `${this.baseUrl}/collections/${collectionPath}`;
      console.log(`🌐 URL: ${collectionUrl}`);

      await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.delay(3000);

      // Check for bot detection
      const title = await page.title();
      if (title.toLowerCase().includes('attention') || title.toLowerCase().includes('blocked')) {
        console.log(`⚠️  Bot protection detected on collection page`);
        await page.close();
        return;
      }

      // Get all product links
      const productLinks = await page.evaluate(() => {
        const links: string[] = [];
        const selectors = [
          'a[href*="/products/"]',
          '.product-item a',
          '.product-card a',
          '.grid-product__link',
        ];

        const seen = new Set<string>();
        selectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/products/') && !href.includes('#')) {
              const fullUrl = href.startsWith('http') ? href : window.location.origin + href;
              if (!seen.has(fullUrl)) {
                seen.add(fullUrl);
                links.push(fullUrl);
              }
            }
          });
        });

        return links;
      });

      console.log(`\n✓ Found ${productLinks.length} products\n`);

      // Scrape each product
      for (let i = 0; i < productLinks.length; i++) {
        console.log(`  [${i + 1}/${productLinks.length}] ${productLinks[i].split('/').pop()}`);

        const productPage = await this.createStealthPage();
        const product = await this.scrapeProductDetails(productPage, productLinks[i], category);
        await productPage.close();

        if (product) {
          this.products.push(product);
          console.log(`    ✓ ${product.name}`);
        }

        await this.delay(2000); // Respectful delay
      }

      await page.close();
    } catch (error: any) {
      console.log(`✗ Error scraping collection: ${error.message}`);
      await page.close();
    }
  }

  public async scrapeAll(): Promise<void> {
    const collections = [
      { path: 'hombre', name: 'Men\'s Boots' },
      { path: 'mujer', name: 'Women\'s Boots' },
      { path: 'cowboy-hombre', name: 'Men\'s Cowboy Boots' },
      { path: 'biker-hombre', name: 'Men\'s Biker Boots' },
      { path: 'biker-mujer', name: 'Women\'s Biker Boots' },
    ];

    for (const collection of collections) {
      await this.scrapeCollection(collection.path, collection.name);
      await this.delay(3000);
    }

    if (this.browser) {
      await this.browser.close();
    }
  }

  public generateRAGDocument(): RAGDocument[] {
    return this.products.map(product => ({
      content: `${product.name}\n\n${product.description}\n\nPrice: ${product.currency}${product.price}\nCategory: ${product.category}\nAvailability: ${product.availability}\n\nThis product has ${product.images.length} images available.`,
      metadata: {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        category: product.category,
        url: product.url,
        images: product.images,
        localImages: product.localImages,
        availability: product.availability,
        type: 'product',
        source: 'sendra.com',
        scrapedAt: product.metadata.scrapedAt,
      },
    }));
  }

  public saveData(): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`💾 Saving data...`);
    console.log(`${'='.repeat(60)}\n`);

    // Save complete product data
    const productsFile = path.join(this.outputDir, 'sendra-boots-complete.json');
    fs.writeFileSync(productsFile, JSON.stringify(this.products, null, 2));
    console.log(`✓ Products: ${productsFile}`);

    // Save RAG-ready format
    const ragData = this.generateRAGDocument();
    const ragFile = path.join(this.outputDir, 'sendra-boots-rag-ready.json');
    fs.writeFileSync(ragFile, JSON.stringify(ragData, null, 2));
    console.log(`✓ RAG Format: ${ragFile}`);

    // Save summary
    const summary = {
      totalProducts: this.products.length,
      totalImages: this.products.reduce((sum, p) => sum + p.images.length, 0),
      downloadedImages: this.products.reduce((sum, p) => sum + p.localImages.length, 0),
      categories: [...new Set(this.products.map(p => p.category))],
      scrapedAt: new Date().toISOString(),
    };

    const summaryFile = path.join(this.outputDir, 'scrape-complete-summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`✓ Summary: ${summaryFile}`);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ COMPLETE!`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Products: ${summary.totalProducts}`);
    console.log(`Total Images: ${summary.totalImages}`);
    console.log(`Downloaded: ${summary.downloadedImages}`);
    console.log(`\n🎯 Ready for RAG: ${ragFile}`);
  }
}

async function main() {
  const outputDir = path.join(process.cwd(), 'data');

  console.log('');
  console.log('='.repeat(60));
  console.log('🥾 SENDRA BOOTS COMPLETE SCRAPER');
  console.log('='.repeat(60));
  console.log('Target: https://sendra.com/en (English version)');
  console.log('Output: ' + outputDir);
  console.log('='.repeat(60));
  console.log('');

  const scraper = new CompleteSendraScraper(outputDir);

  try {
    await scraper.scrapeAll();
    scraper.saveData();
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();
