import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface ProductData {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  url: string;
  category: string;
  availability: string;
  metadata: {
    scrapedAt: string;
    source: string;
  };
}

interface ScraperConfig {
  baseUrl: string;
  collections: string[];
  outputDir: string;
  delay: number;
  headless: boolean;
}

class SendraBootsPlaywrightScraper {
  private config: ScraperConfig;
  private products: ProductData[] = [];
  private browser: Browser | null = null;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async initBrowser(): Promise<void> {
    console.log('Launching browser...');
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ]
    });
  }

  private async createPage(): Promise<Page> {
    if (!this.browser) {
      await this.initBrowser();
    }
    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      ignoreHTTPSErrors: true,
    });

    // Add extra headers
    await context.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    const page = await context.newPage();

    // Hide automation indicators
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    return page;
  }

  private async scrapeProductFromPage(page: Page, url: string, category: string): Promise<ProductData | null> {
    try {
      console.log(`  Navigating to product: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.delay(1000);

      // Extract product information
      const productData = await page.evaluate(() => {
        const name = document.querySelector('h1.product-title, h1.product__title, .product-single__title, h1')?.textContent?.trim() || '';

        const descriptionElement = document.querySelector('.product-description, .product__description, .product-single__description, .rte');
        const description = descriptionElement?.textContent?.trim() ||
                          document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

        const priceElement = document.querySelector('.product-price, .price, .product__price, .money');
        const priceText = priceElement?.textContent?.trim() || '';
        const price = priceText.replace(/[^\d.,]/g, '');
        const currency = priceText.match(/[€$£]/)?.[0] || 'EUR';

        // Extract all product images
        const imageElements = document.querySelectorAll('img[src*="product"], .product-image img, .product__image img, .product-gallery img, img[alt*="product"]');
        const images: string[] = [];
        imageElements.forEach((img) => {
          let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
          if (src) {
            if (src.startsWith('//')) {
              src = 'https:' + src;
            } else if (src.startsWith('/')) {
              src = window.location.origin + src;
            }
            // Remove size parameters
            src = src.replace(/_(small|medium|large|compact|grande|\d+x\d*|x\d+)\./g, '.');
            if (!images.includes(src) && src.includes('product')) {
              images.push(src);
            }
          }
        });

        // Check stock/availability
        const addToCartBtn = document.querySelector('.add-to-cart, .product-form__submit, button[type="submit"]');
        const soldOutText = document.querySelector('.sold-out, .out-of-stock');
        const availability = soldOutText ? 'Out of Stock' : (addToCartBtn ? 'In Stock' : 'Unknown');

        return {
          name,
          description,
          price,
          currency,
          images,
          availability
        };
      });

      if (!productData.name) {
        console.log(`  ✗ Could not extract product name`);
        return null;
      }

      const id = url.split('/').pop()?.split('?')[0] || `product-${Date.now()}`;

      return {
        id,
        name: productData.name,
        description: productData.description,
        price: productData.price,
        currency: productData.currency,
        images: productData.images,
        url,
        category,
        availability: productData.availability,
        metadata: {
          scrapedAt: new Date().toISOString(),
          source: 'sendra.com'
        }
      };
    } catch (error: any) {
      console.error(`  ✗ Error scraping product: ${error.message}`);
      return null;
    }
  }

  private async scrapeCollection(collectionUrl: string, category: string): Promise<void> {
    console.log(`\nScraping collection: ${collectionUrl}`);
    const page = await this.createPage();

    try {
      await page.goto(collectionUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await this.delay(2000);

      // Check if we got blocked
      const title = await page.title();
      if (title.toLowerCase().includes('attention required') || title.toLowerCase().includes('access denied')) {
        console.error('  ✗ Bot protection detected. Try running with headless: false to solve challenges manually.');
        await page.close();
        return;
      }

      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        console.log(`\n  Page ${currentPage}`);

        // Extract product links from current page
        const productLinks = await page.evaluate(() => {
          const links: string[] = [];
          const anchors = document.querySelectorAll('a[href*="/products/"], a.product-link, .product-item a, .grid-product__link, .product-card a');
          anchors.forEach((a) => {
            const href = a.getAttribute('href');
            if (href && href.includes('/products/')) {
              const fullUrl = href.startsWith('http') ? href : window.location.origin + href;
              if (!links.includes(fullUrl)) {
                links.push(fullUrl);
              }
            }
          });
          return links;
        });

        console.log(`  Found ${productLinks.length} products on page ${currentPage}`);

        // Scrape each product
        for (let i = 0; i < productLinks.length; i++) {
          const productUrl = productLinks[i];
          console.log(`  Product ${i + 1}/${productLinks.length}`);

          const productPage = await this.createPage();
          const product = await this.scrapeProductFromPage(productPage, productUrl, category);
          await productPage.close();

          if (product) {
            this.products.push(product);
            console.log(`    ✓ ${product.name} (${product.images.length} images)`);
          }

          await this.delay(this.config.delay);
        }

        // Check for next page
        const nextButton = await page.$('a.next, a[rel="next"], .pagination__next, button.pagination-next');
        if (nextButton) {
          const isDisabled = await nextButton.evaluate((el) => {
            return el.classList.contains('disabled') ||
                   el.hasAttribute('disabled') ||
                   el.getAttribute('aria-disabled') === 'true';
          });

          if (!isDisabled) {
            console.log(`\n  Going to next page...`);
            await nextButton.click();
            await page.waitForLoadState('networkidle');
            await this.delay(2000);
            currentPage++;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      await page.close();
    } catch (error: any) {
      console.error(`Error scraping collection: ${error.message}`);
      await page.close();
    }
  }

  public async scrape(): Promise<void> {
    console.log('Starting Sendra Boots Playwright scraper...');
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log(`Collections: ${this.config.collections.join(', ')}`);
    console.log(`Headless mode: ${this.config.headless}`);

    await this.initBrowser();

    for (const collection of this.config.collections) {
      const collectionUrl = `${this.config.baseUrl}/collections/${collection}`;
      await this.scrapeCollection(collectionUrl, collection);
      await this.delay(this.config.delay);
    }

    if (this.browser) {
      await this.browser.close();
    }

    console.log(`\n✓ Scraping complete! Total products: ${this.products.length}`);
  }

  public saveData(): void {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Save all products
    const allProductsPath = path.join(this.config.outputDir, 'sendra-boots-all.json');
    fs.writeFileSync(allProductsPath, JSON.stringify(this.products, null, 2));
    console.log(`\n✓ Saved ${this.products.length} products to: ${allProductsPath}`);

    // Save by category
    const byCategory: { [key: string]: ProductData[] } = {};
    this.products.forEach(product => {
      if (!byCategory[product.category]) {
        byCategory[product.category] = [];
      }
      byCategory[product.category].push(product);
    });

    Object.keys(byCategory).forEach(category => {
      const categoryPath = path.join(this.config.outputDir, `sendra-boots-${category}.json`);
      fs.writeFileSync(categoryPath, JSON.stringify(byCategory[category], null, 2));
      console.log(`✓ Saved ${byCategory[category].length} ${category} products`);
    });

    // RAG-optimized format
    const ragFormat = this.products.map(product => ({
      content: `Product: ${product.name}\n\nDescription: ${product.description}\n\nPrice: ${product.currency}${product.price}\nCategory: ${product.category}\nAvailability: ${product.availability}\n\nImages: ${product.images.length} available\n\nProduct URL: ${product.url}`,
      metadata: {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        category: product.category,
        url: product.url,
        images: product.images,
        availability: product.availability,
        scrapedAt: product.metadata.scrapedAt,
        source: product.metadata.source,
        type: 'product'
      }
    }));

    const ragPath = path.join(this.config.outputDir, 'sendra-boots-rag.json');
    fs.writeFileSync(ragPath, JSON.stringify(ragFormat, null, 2));
    console.log(`✓ Saved RAG-optimized data to: ${ragPath}`);

    // Create summary
    const summary = {
      totalProducts: this.products.length,
      totalImages: this.products.reduce((sum, p) => sum + p.images.length, 0),
      categories: Object.keys(byCategory).map(cat => ({
        name: cat,
        count: byCategory[cat].length,
        images: byCategory[cat].reduce((sum, p) => sum + p.images.length, 0)
      })),
      scrapedAt: new Date().toISOString(),
      source: 'sendra.com'
    };

    const summaryPath = path.join(this.config.outputDir, 'scrape-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✓ Saved summary to: ${summaryPath}`);

    // Create a text file for easy RAG ingestion
    const textContent = this.products.map(product => {
      return `===== ${product.name} =====\n` +
             `Category: ${product.category}\n` +
             `Price: ${product.currency}${product.price}\n` +
             `Availability: ${product.availability}\n` +
             `URL: ${product.url}\n` +
             `\nDescription:\n${product.description}\n` +
             `\nImages (${product.images.length}):\n${product.images.join('\n')}\n` +
             `\n${'='.repeat(50)}\n\n`;
    }).join('\n');

    const textPath = path.join(this.config.outputDir, 'sendra-boots-rag.txt');
    fs.writeFileSync(textPath, textContent);
    console.log(`✓ Saved text format to: ${textPath}`);
  }
}

// Main execution
async function main() {
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
    delay: 1500,      // 1.5 seconds between requests
    headless: true    // Set to false if you need to solve captchas manually
  };

  const scraper = new SendraBootsPlaywrightScraper(config);

  try {
    await scraper.scrape();
    scraper.saveData();
    console.log('\n✓ Scraping completed successfully!');
    console.log('\nGenerated files:');
    console.log('  - sendra-boots-all.json (all products)');
    console.log('  - sendra-boots-{category}.json (by category)');
    console.log('  - sendra-boots-rag.json (RAG-optimized format)');
    console.log('  - sendra-boots-rag.txt (text format for RAG)');
    console.log('  - scrape-summary.json (scraping summary)');
  } catch (error: any) {
    console.error('\n✗ Scraping failed:', error.message);
    process.exit(1);
  }
}

main();
