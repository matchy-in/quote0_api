/**
 * Bin Collection Database Service
 * Handles DynamoDB operations for bin_collection table
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.BIN_COLLECTION_TABLE;

// Create DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false
  }
});

class BinCollectionDbService {
  /**
   * Store or update bin collection in database
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} service - Service type (original name from API)
   * @param {object} collectionData - Full collection data
   * @returns {Promise<Object>} Stored collection object
   */
  async upsertBinCollection(date, service, collectionData) {
    try {
      const now = new Date().toISOString();
      
      // Calculate TTL: Auto-delete 90 days after collection date
      const collectionDate = new Date(date);
      const ttlDate = new Date(collectionDate);
      ttlDate.setDate(ttlDate.getDate() + 90);
      const ttl = Math.floor(ttlDate.getTime() / 1000);

      const item = {
        date: date,                    // Partition key (YYYY-MM-DD)
        service: service,              // Sort key (original service name)
        day: collectionData.day || '', // Day of week
        round: collectionData.round || '',
        schedule: collectionData.schedule || '',
        updated_at: now,
        ttl: ttl
      };

      console.log(`[BinCollectionDB] Upserting bin collection: ${date} - ${service}`);

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      await docClient.send(command);
      console.log(`[BinCollectionDB] Successfully stored bin collection`);
      
      return item;
    } catch (error) {
      console.error('[BinCollectionDB] Error upserting bin collection:', error);
      throw error;
    }
  }

  /**
   * Get all bin collections for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of collection objects
   */
  async getBinCollectionsByDate(date) {
    try {
      console.log(`[BinCollectionDB] Querying bin collections for date: ${date}`);

      const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: {
          '#date': 'date'
        },
        ExpressionAttributeValues: {
          ':date': date
        }
      });

      const response = await docClient.send(command);
      const items = response.Items || [];
      
      console.log(`[BinCollectionDB] Found ${items.length} bin collections for ${date}`);
      
      return items;
    } catch (error) {
      console.error('[BinCollectionDB] Error querying bin collections:', error);
      throw error;
    }
  }

  /**
   * Get tomorrow's bin collections
   * @returns {Promise<Array>} Array of tomorrow's collections
   */
  async getTomorrowCollections() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    
    return await this.getBinCollectionsByDate(tomorrowDate);
  }

  /**
   * Batch store bin collections from Reading API
   * @param {Array} collections - Array of collection objects from Reading API
   * @returns {Promise<number>} Number of collections stored
   */
  async storeBinCollections(collections) {
    try {
      console.log(`[BinCollectionDB] Storing ${collections.length} bin collections`);
      
      let storedCount = 0;
      
      for (const collection of collections) {
        // Parse date from "DD/MM/YYYY HH:MM:SS" to "YYYY-MM-DD"
        const [datePart] = collection.date.split(' ');
        const [day, month, year] = datePart.split('/');
        const dateStr = `${year}-${month}-${day}`;
        
        await this.upsertBinCollection(
          dateStr,
          collection.service,
          collection
        );
        
        storedCount++;
      }
      
      console.log(`[BinCollectionDB] Successfully stored ${storedCount} bin collections`);
      return storedCount;
    } catch (error) {
      console.error('[BinCollectionDB] Error storing bin collections:', error);
      throw error;
    }
  }
}

module.exports = new BinCollectionDbService();
