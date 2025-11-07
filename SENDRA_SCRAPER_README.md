# Sendra Boots Web Scraper for RAG

This project includes a complete web scraping solution for extracting product data from Sendra Boots (https://sendra.com/en) to ingest into your RAG (Retrieval Augmented Generation) system.

## 🚀 Quick Start

### 1. Run the Scraper
```bash
# Using Playwright (recommended for handling bot protection)
npm run scrape:sendra:playwright

# Or using the basic scraper
npm run scrape:sendra
```

### 2. Download Product Images
```bash
# Download images from scraped data
npm run download:images

# This creates:
# - Local image files in data/images/
# - CLIP-optimized JSON format
# - Image-to-product mapping
```

### 3. Use Sample Data
If the scraper encounters bot protection, use the provided sample data:
```
data/sendra-boots-sample-rag.json  - 8 sample products in RAG format
data/sendra-boots-sample-rag.txt   - Text format for simple ingestion
data/sendra-boots-clip.json        - CLIP-optimized format
data/image-mapping.json            - Image-to-product mapping
```

### 4. Generate CLIP Embeddings (For Visual Search)
```bash
# Python script to generate image + text embeddings
python3 scrapers/generate-clip-embeddings.py

# Requires: pip install transformers torch pillow
```

### 5. Ingest into Your RAG System
See `scrapers/example-rag-ingest.ts` for examples of how to:
- Generate embeddings using OpenAI
- Store in Supabase with pgvector
- Query the vector database
- Use with LangChain

See `scrapers/CLIP_INTEGRATION_GUIDE.md` for:
- CLIP visual search setup
- Multimodal (text + image) search
- Vector database integration

## 📁 Project Structure

```
├── scrapers/
│   ├── sendra-boots-scraper.ts          # Basic axios+cheerio scraper
│   ├── sendra-boots-playwright.ts       # Advanced Playwright scraper
│   ├── download-images.ts               # Image downloader
│   ├── generate-clip-embeddings.py      # CLIP embedding generator
│   ├── example-rag-ingest.ts            # Example RAG ingestion code
│   ├── CLIP_INTEGRATION_GUIDE.md        # CLIP visual search guide
│   └── README.md                        # Detailed scraper documentation
│
├── data/
│   ├── sendra-boots-sample-rag.json     # Sample products (RAG format)
│   ├── sendra-boots-sample-rag.txt      # Sample products (text format)
│   ├── sendra-boots-clip.json           # CLIP-optimized format
│   ├── image-mapping.json               # Image-to-product mapping
│   ├── sendra-boots-all.json            # All scraped products (when run)
│   ├── sendra-boots-{category}.json     # Products by category
│   ├── sendra-boots-rag.json            # RAG-optimized format
│   ├── sendra-boots-rag.txt             # Text format
│   ├── scrape-summary.json              # Scraping statistics
│   └── images/                          # Downloaded product images
│       └── {product-id}/                # Images organized by product
│           ├── image-1.jpg
│           ├── image-2.jpg
│           └── ...
```

## 📊 Data Format

### RAG-Optimized JSON Format
Each product is structured for easy RAG ingestion:

```json
{
  "content": "Product name and full description with all details...",
  "metadata": {
    "id": "sendra-2073",
    "name": "Sendra 2073 Men's Cowboy Boots",
    "price": "249.00",
    "currency": "EUR",
    "category": "cowboy-hombre",
    "url": "https://sendra.com/en/products/sendra-2073",
    "images": ["url1.jpg", "url2.jpg", ...],
    "availability": "In Stock",
    "type": "product"
  }
}
```

### Categories Scraped
- `hombre` - Men's boots
- `mujer` - Women's boots
- `cowboy-hombre` - Men's cowboy boots
- `biker-hombre` - Men's biker boots
- `biker-mujer` - Women's biker boots

## 🔧 Features

### Scraper Capabilities
✅ Extracts product names, descriptions, prices
✅ Captures all product image URLs
✅ Handles pagination automatically
✅ Respects rate limits with configurable delays
✅ Bypasses bot protection (Playwright version)
✅ Outputs multiple formats (JSON, text)
✅ Structured for RAG ingestion

### Included in This Package
✅ Two scraper implementations (basic + advanced)
✅ Sample data for testing (8 products)
✅ RAG ingestion examples (Supabase, LangChain)
✅ Complete documentation
✅ Ready-to-use NPM scripts

## 🛠️ Dependencies

Already installed:
- `axios` - HTTP requests
- `cheerio` - HTML parsing
- `playwright` - Headless browser automation
- `tsx` - TypeScript execution

## ⚠️ Known Issues

### Bot Protection
The Sendra Boots website uses Cloudflare or similar protection. Solutions:

1. **Use Playwright** (handles JavaScript better)
2. **Run locally** (may have better browser support)
3. **Set headless: false** (solve captchas manually)
4. **Use sample data** (for testing your RAG pipeline)

### Environment Issues
If running in a sandboxed/cloud environment:
- Browser may crash due to lack of dependencies
- SSL certificates may not be trusted
- Limited system resources

**Solution:** Use the provided sample data or run scraper on a local machine.

## 💡 Usage Examples

### Basic Scraping
```bash
npm run scrape:sendra:playwright
```

### Ingest into Supabase
```typescript
import { ingestToSupabase } from './scrapers/example-rag-ingest';
import products from './data/sendra-boots-sample-rag.json';

await ingestToSupabase(products);
```

### Query Your RAG System
```typescript
import { exampleQuery } from './scrapers/example-rag-ingest';

await exampleQuery('black leather biker boots for men');
```

### Use with LangChain
```typescript
import { Document } from 'langchain/document';
import products from './data/sendra-boots-sample-rag.json';

const documents = products.map(p => new Document({
  pageContent: p.content,
  metadata: p.metadata
}));

await vectorStore.addDocuments(documents);
```

## 🎯 Next Steps

1. **Test with sample data**
   - Use `data/sendra-boots-sample-rag.json` to test your RAG pipeline

2. **Run scraper locally**
   - Clone to local machine for better browser support
   - Adjust delay/headless settings as needed

3. **Set up vector database**
   - Create embeddings table in Supabase
   - Or use Pinecone, Weaviate, etc.

4. **Generate embeddings**
   - Use OpenAI, Cohere, or open-source models
   - Store in your vector database

5. **Build RAG application**
   - Query products by similarity
   - Integrate with chat interface
   - Add filtering by price, category, etc.

## 📚 Additional Resources

- **Scraper docs:** `scrapers/README.md`
- **Sample data:** `data/sendra-boots-sample-rag.json`
- **Ingestion example:** `scrapers/example-rag-ingest.ts`

## 🔒 Legal & Ethics

This scraper is for personal/educational use only. Always:
- Respect robots.txt
- Follow the website's terms of service
- Use reasonable rate limits
- Don't overload servers

## 🐛 Troubleshooting

**Q: Getting 403 errors?**
A: The site has bot protection. Try Playwright with `headless: false` or use sample data.

**Q: Browser crashes?**
A: Environment issue. Run locally or use sample data.

**Q: No products found?**
A: Site structure may have changed. Update selectors in scraper.

**Q: How do I add more categories?**
A: Edit the `collections` array in the scraper config.

## 📞 Support

For issues or questions:
1. Check `scrapers/README.md` for detailed docs
2. Review the example ingestion script
3. Inspect the sample data format
4. Test locally if environment issues persist

---

**Built with:** TypeScript, Playwright, Axios, Cheerio
**Target:** Sendra Boots (https://sendra.com/en)
**Purpose:** RAG system data ingestion
**Status:** Ready to use (with sample data provided)
