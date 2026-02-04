/**
 * DynamoDB Service
 * Handles all DynamoDB operations for events
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.EVENTS_TABLE;

// Create DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Create Document client for easier operations
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false
  }
});

class DynamoDbService {
  /**
   * Get all events for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of event objects
   */
  async getEventsByDate(date) {
    try {
      console.log(`[DynamoDB] Querying events for date: ${date}`);
      console.log(`[DynamoDB] Table: ${TABLE_NAME}`);

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
      
      console.log(`[DynamoDB] Found ${items.length} events for date ${date}`);
      
      return items;
    } catch (error) {
      console.error('[DynamoDB] Error querying events:', error);
      console.error('[DynamoDB] Error details:', {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode
      });
      throw error;
    }
  }

  /**
   * Create a new event
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} eventText - Event description
   * @returns {Promise<Object>} Created event object
   */
  async createEvent(date, eventText) {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();
      
      // Calculate TTL: Auto-delete events 90 days after their date
      const eventDate = new Date(date);
      const ttlDate = new Date(eventDate);
      ttlDate.setDate(ttlDate.getDate() + 90);
      const ttl = Math.floor(ttlDate.getTime() / 1000); // Unix timestamp

      const item = {
        date: date,           // Partition key (YYYY-MM-DD)
        id: id,               // Sort key (UUID)
        event: eventText,     // Event description
        created_at: now,      // Creation timestamp
        ttl: ttl              // TTL for auto-deletion
      };

      console.log('[DynamoDB] Creating event:', item);
      console.log(`[DynamoDB] Table: ${TABLE_NAME}`);

      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      });

      await docClient.send(command);
      
      console.log('[DynamoDB] Event created successfully');
      
      return item;
    } catch (error) {
      console.error('[DynamoDB] Error creating event:', error);
      console.error('[DynamoDB] Error details:', {
        message: error.message,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode
      });
      throw error;
    }
  }

  /**
   * Health check - verify DynamoDB connection
   * @returns {Promise<boolean>} True if connection is healthy
   */
  async healthCheck() {
    try {
      // Try to query with a date far in the future (won't return results but tests connection)
      const testDate = '9999-12-31';
      const command = new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: {
          '#date': 'date'
        },
        ExpressionAttributeValues: {
          ':date': testDate
        },
        Limit: 1
      });

      await docClient.send(command);
      console.log('[DynamoDB] Health check passed');
      return true;
    } catch (error) {
      console.error('[DynamoDB] Health check failed:', error.message);
      return false;
    }
  }
}

module.exports = new DynamoDbService();
