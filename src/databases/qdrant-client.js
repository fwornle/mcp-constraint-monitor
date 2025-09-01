import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../utils/logger.js';

export class QdrantDatabase {
  constructor(config = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6333,
      collection: config.collection || 'constraints',
      vectorSize: config.vectorSize || 384, // sentence-transformers/all-MiniLM-L6-v2
      distance: config.distance || 'Cosine',
      ...config
    };
    
    this.client = new QdrantClient({
      url: `http://${this.config.host}:${this.config.port}`
    });
    
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.ensureCollection();
      this.initialized = true;
      logger.info('Qdrant database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Qdrant database:', error);
      throw error;
    }
  }

  async ensureCollection() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.config.collection);
      
      if (!exists) {
        // Create collection with optimized settings
        await this.client.createCollection(this.config.collection, {
          vectors: {
            size: this.config.vectorSize,
            distance: this.config.distance,
            hnsw_config: {
              m: 16,           // Optimized for speed
              ef_construct: 100,
              full_scan_threshold: 10000
            },
            quantization_config: {
              scalar: {
                type: 'int8',    // 4x faster queries
                quantile: 0.99,
                always_ram: true
              }
            }
          }
        });
        
        logger.info(`Created Qdrant collection: ${this.config.collection}`);
      }
    } catch (error) {
      logger.error('Failed to ensure collection:', error);
      throw error;
    }
  }

  async addConstraintEvent(eventData) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const point = {
        id: eventData.uuid,
        vector: eventData.embedding,
        payload: {
          agent: eventData.agent,
          eventType: eventData.eventType,
          constraintId: eventData.constraintId,
          violationSeverity: eventData.violationSeverity,
          trajectoryScore: eventData.trajectoryScore,
          timestamp: eventData.timestamp,
          sessionId: eventData.sessionId,
          content: eventData.content,
          resolutionPattern: eventData.resolutionPattern || null
        }
      };

      await this.client.upsert(this.config.collection, {
        wait: false, // Async for performance
        points: [point]
      });

      logger.debug(`Added constraint event to Qdrant: ${eventData.uuid}`);
    } catch (error) {
      logger.error('Failed to add constraint event:', error);
      throw error;
    }
  }

  async searchSimilarViolations(queryEmbedding, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      limit = 10,
      scoreThreshold = 0.7,
      filter = {},
      includePayload = true
    } = options;

    try {
      const results = await this.client.search(this.config.collection, {
        vector: queryEmbedding,
        limit,
        score_threshold: scoreThreshold,
        with_payload: includePayload,
        params: {
          hnsw_ef: 64,        // Speed vs accuracy tradeoff
          exact: false        // Allow approximate results for speed
        },
        filter
      });

      logger.debug(`Found ${results.length} similar violations`);
      return results;
    } catch (error) {
      logger.error('Failed to search similar violations:', error);
      throw error;
    }
  }

  async searchViolationPatterns(query, options = {}) {
    const {
      limit = 5,
      violationsOnly = true,
      successfulResolutions = false
    } = options;

    let filter = {};
    
    if (violationsOnly) {
      filter.must = [
        { key: "violationSeverity", match: { any: [1, 2, 3, 4, 5] } }
      ];
    }

    if (successfulResolutions) {
      filter.must = filter.must || [];
      filter.must.push({
        key: "resolutionPattern",
        match: { except: [null] }
      });
    }

    return await this.searchSimilarViolations(query, {
      limit,
      filter,
      ...options
    });
  }

  async getCollectionInfo() {
    try {
      const info = await this.client.getCollection(this.config.collection);
      return info;
    } catch (error) {
      logger.error('Failed to get collection info:', error);
      throw error;
    }
  }

  async cleanup() {
    // Optional: implement cleanup for old events
    try {
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
      
      await this.client.deletePoints(this.config.collection, {
        filter: {
          must: [{
            key: "timestamp",
            range: {
              lt: cutoffTime
            }
          }]
        }
      });

      logger.info('Cleaned up old constraint events');
    } catch (error) {
      logger.warn('Failed to cleanup old events:', error);
    }
  }

  async close() {
    // Qdrant client doesn't need explicit closing
    this.initialized = false;
    logger.info('Qdrant client closed');
  }
}