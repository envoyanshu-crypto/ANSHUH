# CLIP Visual Search Integration Guide

This guide shows how to integrate the Sendra Boots data with CLIP for multimodal (text + image) search.

## 🎯 What You Have

After running the image downloader, you'll have:
1. **Product data** with image paths (`sendra-boots-clip.json`)
2. **Image mapping** (`image-mapping.json`) - links images to products
3. **Local images** in `data/images/` directory (when downloaded successfully)

## ⚠️ Getting the Images

Due to bot protection on the Sendra website, you have a few options:

### Option 1: Manual Download (Recommended)
1. Visit https://sendra.com/en in your browser
2. Browse products and right-click to save images
3. Save them to `data/images/{product-id}/image-1.jpg` format
4. Update the `localImages` paths in your JSON files

### Option 2: Run Scraper Locally
```bash
# Clone this repo to your local machine
# Set headless: false in sendra-boots-playwright.ts
npm run scrape:sendra:playwright
npm run download:images
```

### Option 3: Use Your Own Images
If you have product images from another source:
1. Organize them in `data/images/{product-id}/` folders
2. Update the JSON files with correct paths
3. Follow the CLIP integration steps below

### Option 4: Use Placeholder Images for Testing
For testing your CLIP pipeline without real Sendra images:
```bash
# Create demo structure
mkdir -p data/images/test-product
# Add any test images to this folder
```

## 🔧 CLIP Integration

### 1. Install CLIP Dependencies

```bash
# Python environment
pip install transformers torch pillow
# or
pip install open-clip-torch
```

### 2. Generate Image Embeddings

```python
# example-clip-embeddings.py
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import json
import torch
import os

# Load CLIP model
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# Load image mapping
with open('data/image-mapping.json', 'r') as f:
    image_mapping = json.load(f)

# Generate embeddings for each image
embeddings = []

for item in image_mapping:
    image_path = item['imagePath']

    if not os.path.exists(image_path):
        print(f"⚠️  Image not found: {image_path}")
        continue

    # Load and process image
    image = Image.open(image_path)
    inputs = processor(images=image, return_tensors="pt")

    # Generate embedding
    with torch.no_grad():
        image_features = model.get_image_features(**inputs)

    # Store embedding with metadata
    embeddings.append({
        'imagePath': image_path,
        'productId': item['productId'],
        'productName': item['productName'],
        'category': item['category'],
        'embedding': image_features[0].tolist()
    })

    print(f"✓ Processed: {item['productName']} (image {item['imageIndex'] + 1})")

# Save embeddings
with open('data/clip-image-embeddings.json', 'w') as f:
    json.dump(embeddings, f)

print(f"\n✅ Generated {len(embeddings)} image embeddings")
```

### 3. Generate Text Embeddings

```python
# Generate embeddings for product descriptions
with open('data/sendra-boots-clip.json', 'r') as f:
    products = json.load(f)

text_embeddings = []

for product in products:
    # Create searchable text
    text = f"{product['name']} - {product['description']}"

    # Generate embedding
    inputs = processor(text=[text], return_tensors="pt", padding=True)

    with torch.no_grad():
        text_features = model.get_text_features(**inputs)

    text_embeddings.append({
        'productId': product['id'],
        'productName': product['name'],
        'text': text,
        'embedding': text_features[0].tolist()
    })

    print(f"✓ Processed: {product['name']}")

# Save text embeddings
with open('data/clip-text-embeddings.json', 'w') as f:
    json.dump(text_embeddings, f)

print(f"✅ Generated {len(text_embeddings)} text embeddings")
```

### 4. Store in Vector Database

#### Option A: Supabase with pgvector

```sql
-- Create tables for CLIP embeddings
CREATE TABLE clip_image_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_path TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    category TEXT,
    embedding VECTOR(512),  -- CLIP base model dimension
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE clip_text_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding VECTOR(512),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for fast similarity search
CREATE INDEX ON clip_image_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON clip_text_embeddings USING ivfflat (embedding vector_cosine_ops);
```

```typescript
// Ingest embeddings to Supabase
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Load image embeddings
const imageEmbeddings = JSON.parse(
  fs.readFileSync('data/clip-image-embeddings.json', 'utf-8')
);

// Insert image embeddings
for (const item of imageEmbeddings) {
  await supabase.from('clip_image_embeddings').insert({
    image_path: item.imagePath,
    product_id: item.productId,
    product_name: item.productName,
    category: item.category,
    embedding: item.embedding,
    metadata: { ...item }
  });
}

// Load and insert text embeddings
const textEmbeddings = JSON.parse(
  fs.readFileSync('data/clip-text-embeddings.json', 'utf-8')
);

for (const item of textEmbeddings) {
  await supabase.from('clip_text_embeddings').insert({
    product_id: item.productId,
    product_name: item.productName,
    text: item.text,
    embedding: item.embedding,
    metadata: { ...item }
  });
}
```

#### Option B: Pinecone

```python
import pinecone
import json

# Initialize Pinecone
pinecone.init(api_key="your-api-key", environment="your-env")

# Create index
index = pinecone.Index("sendra-boots-clip")

# Load embeddings
with open('data/clip-image-embeddings.json', 'r') as f:
    image_embeddings = json.load(f)

# Upsert to Pinecone
vectors = [
    (
        f"img_{item['productId']}_{i}",
        item['embedding'],
        {
            'type': 'image',
            'productId': item['productId'],
            'productName': item['productName'],
            'imagePath': item['imagePath'],
            'category': item['category']
        }
    )
    for i, item in enumerate(image_embeddings)
]

index.upsert(vectors=vectors)
```

### 5. Perform Visual Search

#### Text-to-Image Search
```python
# User searches with text: "black leather biker boots"
query_text = "black leather biker boots"

# Generate query embedding
inputs = processor(text=[query_text], return_tensors="pt", padding=True)
with torch.no_grad():
    text_features = model.get_text_features(**inputs)

query_embedding = text_features[0].tolist()

# Search in Supabase
results = supabase.rpc('match_clip_images', {
    'query_embedding': query_embedding,
    'match_count': 10
}).execute()

# Display results
for result in results.data:
    print(f"{result['product_name']} - Similarity: {result['similarity']}")
    print(f"Image: {result['image_path']}")
```

#### Image-to-Image Search
```python
# User uploads an image to find similar products
uploaded_image = Image.open("user_upload.jpg")

# Generate query embedding
inputs = processor(images=uploaded_image, return_tensors="pt")
with torch.no_grad():
    image_features = model.get_image_features(**inputs)

query_embedding = image_features[0].tolist()

# Search for similar images
results = supabase.rpc('match_clip_images', {
    'query_embedding': query_embedding,
    'match_count': 10
}).execute()
```

### 6. Hybrid Search (Text + Metadata Filtering)

```python
# Search with filters
query_text = "cowboy boots"
category_filter = "cowboy-hombre"
max_price = 300

# Generate embedding
inputs = processor(text=[query_text], return_tensors="pt", padding=True)
with torch.no_grad():
    text_features = model.get_text_features(**inputs)

query_embedding = text_features[0].tolist()

# Search with filters (pseudo-code for Supabase)
results = supabase.rpc('match_clip_images_filtered', {
    'query_embedding': query_embedding,
    'category': category_filter,
    'max_price': max_price,
    'match_count': 10
}).execute()
```

## 📊 Data Files Reference

### `sendra-boots-clip.json`
CLIP-optimized product format:
```json
{
  "id": "sendra-2073",
  "name": "Sendra 2073 Men's Cowboy Boots",
  "description": "Full product description...",
  "category": "cowboy-hombre",
  "price": "249.00",
  "currency": "EUR",
  "url": "https://sendra.com/en/products/sendra-2073",
  "images": ["data/images/sendra-2073/image-1.jpg", ...],
  "remoteImages": ["https://..."],
  "metadata": { ... }
}
```

### `image-mapping.json`
Direct image-to-product mapping:
```json
{
  "imagePath": "data/images/sendra-2073/image-1.jpg",
  "productId": "sendra-2073",
  "productName": "Sendra 2073 Men's Cowboy Boots",
  "imageIndex": 0,
  "category": "cowboy-hombre",
  "price": "EUR249.00",
  "url": "https://sendra.com/en/products/sendra-2073"
}
```

## 🚀 Quick Start (After Images Are Available)

```bash
# 1. Run the scraper or manually add images
npm run scrape:sendra:playwright  # if locally
# or manually add images to data/images/

# 2. Download images (if scraper worked)
npm run download:images

# 3. Generate CLIP embeddings (Python)
python example-clip-embeddings.py

# 4. Ingest to vector database
# (use your preferred vector DB)

# 5. Build search interface
# Use the embeddings for similarity search
```

## 💡 Use Cases

1. **Visual Search**: Upload a boot image, find similar products
2. **Text Search**: Search by description ("vintage brown cowboy boots")
3. **Hybrid Search**: Combine visual + text + filters
4. **Recommendation**: Show visually similar products
5. **Category Detection**: Auto-categorize new products

## 🔍 Example Queries

- "black leather motorcycle boots with buckles"
- "western style boots with embroidery"
- "ankle boots for women"
- Upload an image of boots you like

## 📚 Resources

- [OpenAI CLIP](https://github.com/openai/CLIP)
- [Hugging Face CLIP](https://huggingface.co/docs/transformers/model_doc/clip)
- [Supabase Vector](https://supabase.com/docs/guides/ai/vector-columns)
- [Pinecone](https://www.pinecone.io/)

## ⚠️ Important Notes

1. **Image Quality**: Higher quality images = better embeddings
2. **Consistent Sizing**: Preprocess images to consistent sizes
3. **Model Choice**: CLIP ViT-B/32 (512-dim) or ViT-L/14 (768-dim)
4. **Batch Processing**: Process images in batches for efficiency
5. **Caching**: Cache embeddings to avoid regenerating

## 🐛 Troubleshooting

**Q: Images not downloading?**
A: Use manual download or run scraper locally with headless: false

**Q: Out of memory errors?**
A: Process images in smaller batches, use smaller CLIP model

**Q: Slow embedding generation?**
A: Use GPU if available, batch process, cache results

**Q: Poor search results?**
A: Try different CLIP models, adjust similarity thresholds, combine with text metadata
