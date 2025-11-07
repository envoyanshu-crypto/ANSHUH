#!/usr/bin/env python3
"""
Generate CLIP embeddings for Sendra Boots product images and descriptions
Requires: transformers, torch, pillow
Install: pip install transformers torch pillow
"""

import json
import os
from pathlib import Path
from typing import List, Dict, Any
import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image

class CLIPEmbeddingGenerator:
    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        """
        Initialize CLIP model and processor

        Args:
            model_name: HuggingFace model name
                - "openai/clip-vit-base-patch32" (512-dim, faster)
                - "openai/clip-vit-large-patch14" (768-dim, better accuracy)
        """
        print(f"Loading CLIP model: {model_name}")
        self.model = CLIPModel.from_pretrained(model_name)
        self.processor = CLIPProcessor.from_pretrained(model_name)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        print(f"✓ Model loaded on {self.device}")

    def generate_image_embedding(self, image_path: str) -> List[float]:
        """Generate CLIP embedding for an image"""
        try:
            image = Image.open(image_path).convert("RGB")
            inputs = self.processor(images=image, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)

            # Normalize the embedding
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            return image_features[0].cpu().tolist()
        except Exception as e:
            print(f"  ✗ Error processing {image_path}: {e}")
            return None

    def generate_text_embedding(self, text: str) -> List[float]:
        """Generate CLIP embedding for text"""
        inputs = self.processor(text=[text], return_tensors="pt", padding=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            text_features = self.model.get_text_features(**inputs)

        # Normalize the embedding
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        return text_features[0].cpu().tolist()

    def process_image_mapping(self, mapping_file: str, output_file: str) -> Dict[str, Any]:
        """Process all images from image mapping file"""
        print(f"\nProcessing images from {mapping_file}")

        with open(mapping_file, 'r') as f:
            image_mapping = json.load(f)

        embeddings = []
        successful = 0
        failed = 0
        skipped = 0

        for i, item in enumerate(image_mapping, 1):
            image_path = item['imagePath']

            print(f"[{i}/{len(image_mapping)}] {item['productName']} (image {item['imageIndex'] + 1})")

            if not os.path.exists(image_path):
                print(f"  ⚠️  Image not found, skipping")
                skipped += 1
                continue

            embedding = self.generate_image_embedding(image_path)

            if embedding is None:
                failed += 1
                continue

            embeddings.append({
                'imagePath': image_path,
                'productId': item['productId'],
                'productName': item['productName'],
                'imageIndex': item['imageIndex'],
                'category': item['category'],
                'price': item['price'],
                'url': item['url'],
                'embedding': embedding,
                'embeddingDim': len(embedding)
            })

            successful += 1
            print(f"  ✓ Generated {len(embedding)}-dim embedding")

        # Save embeddings
        with open(output_file, 'w') as f:
            json.dump(embeddings, f, indent=2)

        stats = {
            'total': len(image_mapping),
            'successful': successful,
            'failed': failed,
            'skipped': skipped
        }

        print(f"\n{'='*50}")
        print(f"Image Embedding Statistics")
        print(f"{'='*50}")
        print(f"Total images:     {stats['total']}")
        print(f"✓ Successful:     {stats['successful']}")
        print(f"✗ Failed:         {stats['failed']}")
        print(f"⚠️  Skipped:        {stats['skipped']}")
        print(f"{'='*50}\n")

        return stats

    def process_products(self, products_file: str, output_file: str) -> Dict[str, Any]:
        """Process product descriptions for text embeddings"""
        print(f"\nProcessing product descriptions from {products_file}")

        with open(products_file, 'r') as f:
            products = json.load(f)

        embeddings = []

        for i, product in enumerate(products, 1):
            print(f"[{i}/{len(products)}] {product['name']}")

            # Create searchable text combining name and description
            text = f"{product['name']}. {product['description']}"

            embedding = self.generate_text_embedding(text)

            embeddings.append({
                'productId': product['id'],
                'productName': product['name'],
                'text': text,
                'category': product['category'],
                'price': product['price'],
                'currency': product['currency'],
                'url': product['url'],
                'embedding': embedding,
                'embeddingDim': len(embedding)
            })

            print(f"  ✓ Generated {len(embedding)}-dim embedding")

        # Save embeddings
        with open(output_file, 'w') as f:
            json.dump(embeddings, f, indent=2)

        print(f"\n✓ Saved {len(embeddings)} text embeddings to {output_file}")

        return {'total': len(embeddings), 'successful': len(embeddings)}


def main():
    """Main execution"""
    # Configuration
    BASE_DIR = Path(__file__).parent.parent
    DATA_DIR = BASE_DIR / "data"

    IMAGE_MAPPING_FILE = DATA_DIR / "image-mapping.json"
    PRODUCTS_FILE = DATA_DIR / "sendra-boots-clip.json"

    IMAGE_EMBEDDINGS_OUTPUT = DATA_DIR / "clip-image-embeddings.json"
    TEXT_EMBEDDINGS_OUTPUT = DATA_DIR / "clip-text-embeddings.json"

    print("="*50)
    print("CLIP Embedding Generator for Sendra Boots")
    print("="*50)
    print(f"Data directory: {DATA_DIR}")
    print()

    # Check if files exist
    if not IMAGE_MAPPING_FILE.exists():
        print(f"⚠️  Warning: {IMAGE_MAPPING_FILE} not found")
        print("Run the image downloader first: npm run download:images")
        print()

    if not PRODUCTS_FILE.exists():
        print(f"⚠️  Warning: {PRODUCTS_FILE} not found")
        print("Run the image downloader first: npm run download:images")
        print()

    # Initialize CLIP
    generator = CLIPEmbeddingGenerator()

    # Process images if mapping exists
    if IMAGE_MAPPING_FILE.exists():
        print("\n" + "="*50)
        print("Step 1: Generating Image Embeddings")
        print("="*50)
        image_stats = generator.process_image_mapping(
            str(IMAGE_MAPPING_FILE),
            str(IMAGE_EMBEDDINGS_OUTPUT)
        )
        print(f"✓ Saved image embeddings to {IMAGE_EMBEDDINGS_OUTPUT}")
    else:
        print("\n⚠️  Skipping image embeddings (mapping file not found)")

    # Process product descriptions if file exists
    if PRODUCTS_FILE.exists():
        print("\n" + "="*50)
        print("Step 2: Generating Text Embeddings")
        print("="*50)
        text_stats = generator.process_products(
            str(PRODUCTS_FILE),
            str(TEXT_EMBEDDINGS_OUTPUT)
        )
    else:
        print("\n⚠️  Skipping text embeddings (products file not found)")

    # Summary
    print("\n" + "="*50)
    print("✅ CLIP Embedding Generation Complete!")
    print("="*50)
    print("\nGenerated files:")
    if IMAGE_EMBEDDINGS_OUTPUT.exists():
        print(f"  • {IMAGE_EMBEDDINGS_OUTPUT}")
    if TEXT_EMBEDDINGS_OUTPUT.exists():
        print(f"  • {TEXT_EMBEDDINGS_OUTPUT}")
    print("\nNext steps:")
    print("  1. Review the generated embedding files")
    print("  2. Ingest embeddings into your vector database")
    print("  3. Build search/recommendation features")
    print("\nSee CLIP_INTEGRATION_GUIDE.md for detailed instructions")
    print()


if __name__ == "__main__":
    main()
