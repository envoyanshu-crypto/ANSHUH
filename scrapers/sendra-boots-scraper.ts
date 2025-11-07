import axios from 'axios';
import * as cheerio from 'cheerio';
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
}

class SendraBootsScraper {
  private config: ScraperConfig;
  private products: ProductData[] = [];

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchPage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
        },
        timeout: 30000,
      });
      return response.data;
    } catch (error: any) {
      console.error(`Error fetching ${url}: ${error.message}`);
      throw error;
    }
  }

  private parseProductPage(html: string, url: string, category: string): ProductData | null {
    const $ = cheerio.load(html);

    try {
      // Extract product information
      const name = $('h1.product-title, h1.product__title, .product-single__title').first().text().trim() ||
                   $('h1').first().text().trim();

      const description = $('.product-description, .product__description, .product-single__description').first().text().trim() ||
                         $('.rte').first().text().trim() ||
                         $('meta[name="description"]').attr('content') || '';

      const priceText = $('.product-price, .price, .product__price, .money').first().text().trim();
      const price = priceText.replace(/[^\d.,]/g, '');
      const currency = priceText.match(/[€$£]/)?.[0] || 'EUR';

      // Extract images
      const images: string[] = [];
      $('img[src*="product"], .product-image img, .product__image img, img[alt*="product"]').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src) {
          // Convert relative URLs to absolute
          if (src.startsWith('//')) {
            src = 'https:' + src;
          } else if (src.startsWith('/')) {
            src = this.config.baseUrl + src;
          }
          // Remove size parameters to get full-size images
          src = src.replace(/_(small|medium|large|compact|grande|\d+x\d*|x\d+)\./g, '.');
          if (!images.includes(src)) {
            images.push(src);
          }
        }
      });

      // Extract availability
      const availability = $('.product-availability, .product__availability, .availability').first().text().trim() ||
                          ($('.add-to-cart, .product-form__submit').length > 0 ? 'In Stock' : 'Unknown');

      // Generate a unique ID
      const id = url.split('/').pop() || `product-${Date.now()}`;

      return {
        id,
        name,
        description,
        price,
        currency,
        images,
        url,
        category,
        availability,
        metadata: {
          scrapedAt: new Date().toISOString(),
          source: 'sendra.com'
        }
      };
    } catch (error: any) {
      console.error(`Error parsing product page ${url}: ${error.message}`);
      return null;
    }
  }

  private async scrapeCollection(collectionUrl: string, category: string): Promise<void> {
    console.log(`\nScraping collection: ${collectionUrl}`);

    try {
      const html = await this.fetchPage(collectionUrl);
      const $ = cheerio.load(html);

      // Find all product links
      const productLinks: string[] = [];
      $('a[href*="/products/"], a.product-link, .product-item a, .grid-product__link').each((_, el) => {
        let href = $(el).attr('href');
        if (href && href.includes('/products/')) {
          if (href.startsWith('/')) {
            href = this.config.baseUrl + href;
          }
          if (!productLinks.includes(href)) {
            productLinks.push(href);
          }
        }
      });

      console.log(`Found ${productLinks.length} product links in ${category}`);

      // Scrape each product
      for (let i = 0; i < productLinks.length; i++) {
        const productUrl = productLinks[i];
        console.log(`Scraping product ${i + 1}/${productLinks.length}: ${productUrl}`);

        try {
          const productHtml = await this.fetchPage(productUrl);
          const product = this.parseProductPage(productHtml, productUrl, category);

          if (product && product.name) {
            this.products.push(product);
            console.log(`  ✓ Scraped: ${product.name}`);
          } else {
            console.log(`  ✗ Failed to extract product data`);
          }

          // Delay between requests to be respectful
          await this.delay(this.config.delay);
        } catch (error: any) {
          console.error(`  ✗ Error scraping product: ${error.message}`);
        }
      }

      // Check for pagination
      const nextPageLink = $('a.next, a[rel="next"], .pagination__next').attr('href');
      if (nextPageLink) {
        const nextUrl = nextPageLink.startsWith('http') ? nextPageLink : this.config.baseUrl + nextPageLink;
        console.log(`Found next page: ${nextUrl}`);
        await this.delay(this.config.delay);
        await this.scrapeCollection(nextUrl, category);
      }

    } catch (error: any) {
      console.error(`Error scraping collection ${collectionUrl}: ${error.message}`);
    }
  }

  public async scrape(): Promise<void> {
    console.log('Starting Sendra Boots scraper...');
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log(`Collections: ${this.config.collections.join(', ')}`);

    for (const collection of this.config.collections) {
      const collectionUrl = `${this.config.baseUrl}/collections/${collection}`;
      await this.scrapeCollection(collectionUrl, collection);
      await this.delay(this.config.delay);
    }

    console.log(`\n✓ Scraping complete! Total products: ${this.products.length}`);
  }

  public saveData(): void {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Save all products to a single JSON file
    const allProductsPath = path.join(this.config.outputDir, 'sendra-boots-all.json');
    fs.writeFileSync(allProductsPath, JSON.stringify(this.products, null, 2));
    console.log(`\n✓ Saved all products to: ${allProductsPath}`);

    // Save products by category
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
      console.log(`✓ Saved ${byCategory[category].length} products to: ${categoryPath}`);
    });

    // Create a RAG-optimized format
    const ragFormat = this.products.map(product => ({
      content: `${product.name}\n\n${product.description}\n\nPrice: ${product.currency}${product.price}\nCategory: ${product.category}\nAvailability: ${product.availability}`,
      metadata: {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        category: product.category,
        url: product.url,
        images: product.images,
        scrapedAt: product.metadata.scrapedAt,
        source: product.metadata.source
      }
    }));

    const ragPath = path.join(this.config.outputDir, 'sendra-boots-rag.json');
    fs.writeFileSync(ragPath, JSON.stringify(ragFormat, null, 2));
    console.log(`✓ Saved RAG-optimized data to: ${ragPath}`);

    // Create a summary
    const summary = {
      totalProducts: this.products.length,
      categories: Object.keys(byCategory).map(cat => ({
        name: cat,
        count: byCategory[cat].length
      })),
      scrapedAt: new Date().toISOString(),
      source: 'sendra.com'
    };

    const summaryPath = path.join(this.config.outputDir, 'scrape-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`✓ Saved summary to: ${summaryPath}`);
  }
}

// Main execution
async function main() {
  const config: ScraperConfig = {
    baseUrl: 'https://sendra.com/en',
    collections: [
      'hombre',      // Men's boots
      'mujer',       // Women's boots
      'cowboy-hombre', // Men's cowboy boots
      'biker-hombre',  // Men's biker boots
      'biker-mujer'    // Women's biker boots
    ],
    outputDir: path.join(process.cwd(), 'data'),
    delay: 2000 // 2 seconds between requests
  };

  const scraper = new SendraBootsScraper(config);

  try {
    await scraper.scrape();
    scraper.saveData();
    console.log('\n✓ Scraping completed successfully!');
  } catch (error: any) {
    console.error('\n✗ Scraping failed:', error.message);
    process.exit(1);
  }
}

main();
