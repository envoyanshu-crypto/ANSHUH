import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Example script showing how to ingest Sendra Boots scraped data into a RAG system
 * This demonstrates integration with Supabase + pgvector, but the pattern
 * can be adapted for other vector databases (Pinecone, Weaviate, Qdrant, etc.)
 */

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
    availability: string;
    scrapedAt: string;
    source: string;
    type: string;
  };
}

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-url';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'your-supabase-key';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-key';

/**
 * Generate embeddings using OpenAI API
 * You can replace this with any embedding provider (Cohere, HuggingFace, etc.)
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small', // or text-embedding-ada-002
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Ingest products into Supabase vector store
 */
async function ingestToSupabase(products: ProductData[]) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Ingesting ${products.length} products into Supabase...`);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] Processing: ${product.metadata.name}`);

    try {
      // Generate embedding from the content
      const embedding = await generateEmbedding(product.content);

      // Insert into your vector table
      // Make sure you have a table set up like:
      // CREATE TABLE product_embeddings (
      //   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      //   content TEXT,
      //   embedding VECTOR(1536), -- or 3072 for text-embedding-3-large
      //   metadata JSONB,
      //   created_at TIMESTAMP DEFAULT NOW()
      // );
      const { error } = await supabase.from('product_embeddings').insert({
        content: product.content,
        embedding: embedding,
        metadata: product.metadata,
      });

      if (error) {
        console.error(`  ✗ Error: ${error.message}`);
      } else {
        console.log(`  ✓ Ingested successfully`);
      }

      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`  ✗ Error generating embedding: ${error.message}`);
    }
  }

  console.log('\n✓ Ingestion complete!');
}

/**
 * Alternative: Ingest using LangChain
 */
async function ingestWithLangChain(products: ProductData[]) {
  // Example using LangChain (you'll need to install these packages):
  // npm install langchain @langchain/openai @langchain/community

  // import { OpenAIEmbeddings } from '@langchain/openai';
  // import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
  // import { Document } from 'langchain/document';

  // const embeddings = new OpenAIEmbeddings({
  //   openAIApiKey: OPENAI_API_KEY,
  // });

  // const documents = products.map(
  //   (product) =>
  //     new Document({
  //       pageContent: product.content,
  //       metadata: product.metadata,
  //     })
  // );

  // const vectorStore = await SupabaseVectorStore.fromDocuments(
  //   documents,
  //   embeddings,
  //   {
  //     client: createClient(SUPABASE_URL, SUPABASE_KEY),
  //     tableName: 'product_embeddings',
  //   }
  // );

  console.log('LangChain ingestion example (commented out)');
}

/**
 * Query example: How to search the ingested data
 */
async function exampleQuery(query: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`\nSearching for: "${query}"`);

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Perform similarity search
  // You'll need to create a function in Supabase:
  // CREATE FUNCTION match_products (
  //   query_embedding VECTOR(1536),
  //   match_threshold FLOAT,
  //   match_count INT
  // )
  // RETURNS TABLE (
  //   id UUID,
  //   content TEXT,
  //   metadata JSONB,
  //   similarity FLOAT
  // )
  // LANGUAGE SQL
  // AS $$
  //   SELECT
  //     id,
  //     content,
  //     metadata,
  //     1 - (embedding <=> query_embedding) as similarity
  //   FROM product_embeddings
  //   WHERE 1 - (embedding <=> query_embedding) > match_threshold
  //   ORDER BY embedding <=> query_embedding
  //   LIMIT match_count;
  // $$;

  const { data, error } = await supabase.rpc('match_products', {
    query_embedding: queryEmbedding,
    match_threshold: 0.7,
    match_count: 5,
  });

  if (error) {
    console.error('Error querying:', error);
    return;
  }

  console.log('\nTop Results:');
  data?.forEach((result: any, i: number) => {
    console.log(`\n${i + 1}. ${result.metadata.name} (${result.similarity.toFixed(2)} similarity)`);
    console.log(`   Price: ${result.metadata.currency}${result.metadata.price}`);
    console.log(`   Category: ${result.metadata.category}`);
    console.log(`   URL: ${result.metadata.url}`);
  });
}

/**
 * Main execution
 */
async function main() {
  // Load the scraped data
  const dataPath = path.join(process.cwd(), 'data', 'sendra-boots-sample-rag.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found: ${dataPath}`);
    console.log('Please run the scraper first: npm run scrape:sendra:playwright');
    process.exit(1);
  }

  const products: ProductData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`Loaded ${products.length} products from ${dataPath}`);

  // Choose your ingestion method
  const method = process.argv[2] || 'supabase'; // or 'langchain'

  if (method === 'supabase') {
    await ingestToSupabase(products);
  } else if (method === 'langchain') {
    await ingestWithLangChain(products);
  } else {
    console.error('Unknown method. Use: supabase or langchain');
    process.exit(1);
  }

  // Example query
  console.log('\n=== Example Query ===');
  // await exampleQuery('black leather biker boots for men');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { generateEmbedding, ingestToSupabase, exampleQuery };
