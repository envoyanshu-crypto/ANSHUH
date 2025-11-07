# 🎯 Ready-to-Upload RAG File

## File: `SENDRA_BOOTS_RAG_COMPLETE.json`

This is your **ready-made file** to upload directly to your RAG system!

### 📊 What's Inside

- **20 Sendra Boots products** from the English website
- **Complete product information**:
  - Product names and descriptions
  - Prices in EUR
  - Categories (Men's/Women's, Cowboy/Biker/Ankle boots)
  - Availability status
  - Product URLs
  - **100+ product images** (URLs included)
  - SKUs, materials, features

### 📋 Data Format

Each product in the JSON array has this structure:

```json
{
  "content": "Product name\n\nDetailed description...\n\nPrice: EUR X\nCategory: Y\nAvailability: Z\n\nThis product has N images available.",
  "metadata": {
    "id": "sendra-XXXX",
    "name": "Product Name",
    "price": "XXX.00",
    "currency": "EUR",
    "category": "Category Name",
    "url": "https://sendra.com/en/products/...",
    "images": ["url1", "url2", ...],
    "availability": "In Stock",
    "type": "product",
    "source": "sendra.com",
    "sku": "XXXX",
    "material": "Leather type",
    "features": ["feature1", "feature2"]
  }
}
```

### 🚀 How to Upload to Your RAG System

#### Option 1: Direct JSON Upload

If your RAG system accepts JSON:
```bash
# Simply upload SENDRA_BOOTS_RAG_COMPLETE.json
```

#### Option 2: Using Supabase + pgvector

```typescript
import { createClient } from '@supabase/supabase-js';
import products from './data/SENDRA_BOOTS_RAG_COMPLETE.json';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Generate embeddings and upload
for (const product of products) {
  const embedding = await generateEmbedding(product.content); // Your embedding function

  await supabase.from('documents').insert({
    content: product.content,
    embedding: embedding,
    metadata: product.metadata
  });
}
```

#### Option 3: Using LangChain

```typescript
import { Document } from 'langchain/document';
import products from './data/SENDRA_BOOTS_RAG_COMPLETE.json';

const documents = products.map(p => new Document({
  pageContent: p.content,
  metadata: p.metadata
}));

// Add to your vector store
await vectorStore.addDocuments(documents);
```

#### Option 4: Using Python

```python
import json

with open('data/SENDRA_BOOTS_RAG_COMPLETE.json', 'r') as f:
    products = json.load(f)

# Process each product
for product in products:
    # Generate embedding for product.content
    embedding = your_embedding_function(product['content'])

    # Store in your vector database
    your_vector_db.insert({
        'content': product['content'],
        'embedding': embedding,
        'metadata': product['metadata']
    })
```

### 🖼️ For CLIP Visual Search

The file includes image URLs for all products:

```python
import json

with open('data/SENDRA_BOOTS_RAG_COMPLETE.json', 'r') as f:
    products = json.load(f)

# Extract all image URLs
for product in products:
    for image_url in product['metadata']['images']:
        # Download and process image
        # Generate CLIP embedding
        # Store in vector database
```

### 📈 Product Breakdown

- **Men's Cowboy Boots**: 6 products
- **Men's Biker Boots**: 5 products
- **Men's Boots (Chelsea/Ankle)**: 3 products
- **Women's Boots**: 4 products
- **Women's Biker Boots**: 2 products

Total: **20 products** with **105 product images**

### 🔍 Example Queries Your RAG Can Answer

After uploading, your system can answer:

- "Show me black leather biker boots for men"
- "What cowboy boots do you have under 300 EUR?"
- "Find boots with exotic leather"
- "Show women's ankle boots with zippers"
- "What boots are best for motorcycle riding?"

### 🎨 For CLIP Visual Search

Each product includes multiple image URLs. You can:

1. **Download the images** using the URLs in `metadata.images`
2. **Generate CLIP embeddings** for visual search
3. **Enable image-to-image search** (upload boot photo, find similar)
4. **Enable text-to-image search** ("show black leather boots")

### 💡 Tips

1. **Content field**: Optimized text for RAG semantic search
2. **Metadata**: Rich structured data for filtering
3. **Images**: Multiple angles per product for CLIP
4. **URLs**: Link back to original product pages
5. **Categories**: Pre-categorized for filtering

### 🔧 Customization

You can easily modify the file to:
- Add more products (follow the same format)
- Remove products you don't need
- Add additional metadata fields
- Translate descriptions
- Add your own product images

### ✅ Quality Checklist

- ✅ 20 real Sendra boots products
- ✅ English descriptions
- ✅ Accurate pricing in EUR
- ✅ Multiple images per product (105 total)
- ✅ Categories and filters
- ✅ RAG-optimized text content
- ✅ Rich metadata for search
- ✅ CLIP-ready image URLs
- ✅ Product page URLs included

### 🚀 You're Ready!

This file is **ready to upload** to your RAG system right now. No additional processing needed!

Just:
1. Open `SENDRA_BOOTS_RAG_COMPLETE.json`
2. Upload to your vector database
3. Start querying!

For CLIP visual search:
1. Download images from URLs
2. Run `python3 scrapers/generate-clip-embeddings.py`
3. Upload embeddings to vector DB
4. Enable visual search!
