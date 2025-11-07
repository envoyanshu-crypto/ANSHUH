import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

interface ProductData {
  content: string;
  metadata: {
    id: string;
    name: string;
    price: string;
    currency: string;
    category: string;
    url: string;
    images: string[];
    localImages?: string[];
    availability: string;
    scrapedAt: string;
    source: string;
    type: string;
  };
}

interface DownloadStats {
  totalProducts: number;
  totalImages: number;
  downloadedImages: number;
  failedImages: number;
  skippedImages: number;
}

class ImageDownloader {
  private outputDir: string;
  private stats: DownloadStats = {
    totalProducts: 0,
    totalImages: 0,
    downloadedImages: 0,
    failedImages: 0,
    skippedImages: 0,
  };

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  private sanitizeFilename(filename: string): string {
    // Remove invalid characters and limit length
    return filename
      .replace(/[^a-zA-Z0-9-_.]/g, '_')
      .substring(0, 100);
  }

  private async downloadImage(url: string, filepath: string): Promise<boolean> {
    try {
      // Check if file already exists
      if (fs.existsSync(filepath)) {
        console.log(`      ↓ Already exists: ${path.basename(filepath)}`);
        this.stats.skippedImages++;
        return true;
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Download the file
      await pipeline(response.data, createWriteStream(filepath));

      console.log(`      ✓ Downloaded: ${path.basename(filepath)}`);
      this.stats.downloadedImages++;
      return true;
    } catch (error: any) {
      console.error(`      ✗ Failed: ${error.message}`);
      this.stats.failedImages++;
      return false;
    }
  }

  private getImageExtension(url: string): string {
    const match = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
    return match ? match[1] : 'jpg';
  }

  public async downloadProductImages(product: ProductData): Promise<string[]> {
    const localImagePaths: string[] = [];
    const productDir = path.join(this.outputDir, this.sanitizeFilename(product.metadata.id));

    console.log(`\n  Product: ${product.metadata.name}`);
    console.log(`  Images: ${product.metadata.images.length}`);

    for (let i = 0; i < product.metadata.images.length; i++) {
      const imageUrl = product.metadata.images[i];
      const extension = this.getImageExtension(imageUrl);
      const filename = `image-${i + 1}.${extension}`;
      const filepath = path.join(productDir, filename);

      const success = await this.downloadImage(imageUrl, filepath);
      if (success) {
        // Store relative path for portability
        localImagePaths.push(path.relative(process.cwd(), filepath));
      }

      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return localImagePaths;
  }

  public async downloadAllImages(products: ProductData[]): Promise<ProductData[]> {
    console.log('\n🖼️  Starting image download...\n');
    this.stats.totalProducts = products.length;
    this.stats.totalImages = products.reduce((sum, p) => sum + p.metadata.images.length, 0);

    console.log(`Total products: ${this.stats.totalProducts}`);
    console.log(`Total images: ${this.stats.totalImages}\n`);

    const updatedProducts: ProductData[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`[${i + 1}/${products.length}]`);

      const localImages = await this.downloadProductImages(product);

      // Update product with local image paths
      const updatedProduct = {
        ...product,
        metadata: {
          ...product.metadata,
          localImages: localImages,
        },
      };

      updatedProducts.push(updatedProduct);
    }

    return updatedProducts;
  }

  public printStats(): void {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Download Statistics');
    console.log('='.repeat(50));
    console.log(`Total products:     ${this.stats.totalProducts}`);
    console.log(`Total images:       ${this.stats.totalImages}`);
    console.log(`✓ Downloaded:       ${this.stats.downloadedImages}`);
    console.log(`↓ Already existed:  ${this.stats.skippedImages}`);
    console.log(`✗ Failed:           ${this.stats.failedImages}`);
    console.log('='.repeat(50) + '\n');
  }
}

async function main() {
  const inputFile = process.argv[2] || path.join(process.cwd(), 'data', 'sendra-boots-sample-rag.json');
  const outputDir = process.argv[3] || path.join(process.cwd(), 'data', 'images');

  console.log('🎯 Sendra Boots Image Downloader');
  console.log('='.repeat(50));
  console.log(`Input file: ${inputFile}`);
  console.log(`Output directory: ${outputDir}`);

  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`\n❌ Error: Input file not found: ${inputFile}`);
    console.log('\nUsage: tsx scrapers/download-images.ts [input-file] [output-dir]');
    console.log('Example: tsx scrapers/download-images.ts data/sendra-boots-sample-rag.json data/images');
    process.exit(1);
  }

  // Load products
  const products: ProductData[] = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  console.log(`\n✓ Loaded ${products.length} products`);

  // Download images
  const downloader = new ImageDownloader(outputDir);
  const updatedProducts = await downloader.downloadAllImages(products);

  // Print statistics
  downloader.printStats();

  // Save updated data with local image paths
  const outputFile = inputFile.replace('.json', '-with-images.json');
  fs.writeFileSync(outputFile, JSON.stringify(updatedProducts, null, 2));
  console.log(`✓ Saved updated data to: ${outputFile}`);

  // Create CLIP-optimized format
  const clipFormat = updatedProducts.map(product => ({
    id: product.metadata.id,
    name: product.metadata.name,
    description: product.content,
    category: product.metadata.category,
    price: product.metadata.price,
    currency: product.metadata.currency,
    url: product.metadata.url,
    images: product.metadata.localImages || [],
    remoteImages: product.metadata.images,
    metadata: product.metadata,
  }));

  const clipFile = path.join(path.dirname(inputFile), 'sendra-boots-clip.json');
  fs.writeFileSync(clipFile, JSON.stringify(clipFormat, null, 2));
  console.log(`✓ Saved CLIP-optimized format to: ${clipFile}`);

  // Create a simple mapping file for CLIP embeddings
  const imageMapping = updatedProducts.flatMap(product =>
    (product.metadata.localImages || []).map((imagePath, index) => ({
      imagePath: imagePath,
      productId: product.metadata.id,
      productName: product.metadata.name,
      imageIndex: index,
      category: product.metadata.category,
      price: `${product.metadata.currency}${product.metadata.price}`,
      url: product.metadata.url,
    }))
  );

  const mappingFile = path.join(path.dirname(inputFile), 'image-mapping.json');
  fs.writeFileSync(mappingFile, JSON.stringify(imageMapping, null, 2));
  console.log(`✓ Saved image mapping to: ${mappingFile}`);

  console.log('\n✅ Image download complete!');
  console.log('\nFiles generated:');
  console.log(`  1. ${outputFile} - Products with local image paths`);
  console.log(`  2. ${clipFile} - CLIP-optimized format`);
  console.log(`  3. ${mappingFile} - Image-to-product mapping`);
  console.log(`\nImages saved to: ${outputDir}/`);
}

main().catch(console.error);
