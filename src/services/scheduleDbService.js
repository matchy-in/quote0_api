/**
 * Schedule DB Service
 * Stores a weekly schedule (monday..sunday) in DynamoDB.
 * One item per day: { day, items: [{ time, task }], updated_at }
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.SCHEDULE_TABLE;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

class ScheduleDbService {
  get days() {
    return DAYS;
  }

  /**
   * Save the schedule for the given days (days not supplied are left untouched)
   * @param {Object} schedule - { monday: [{time, task}], ... }
   */
  async saveSchedule(schedule) {
    const now = new Date().toISOString();
    const saved = [];
    for (const day of DAYS) {
      if (schedule[day] === undefined) continue;
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: { day, items: schedule[day], updated_at: now }
      }));
      saved.push(day);
    }
    return saved;
  }

  /**
   * Get schedule for one day
   * @returns {Promise<Array>} items (empty array if none)
   */
  async getDay(day) {
    const res = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { day } }));
    return res.Item ? res.Item.items : [];
  }

  /**
   * Get the full week
   * @returns {Promise<Object>} { monday: [...], ..., sunday: [...] }
   */
  async getWeek() {
    const res = await docClient.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: DAYS.map(day => ({ day })) } }
    }));
    const rows = (res.Responses && res.Responses[TABLE_NAME]) || [];
    const week = {};
    for (const day of DAYS) week[day] = [];
    for (const row of rows) week[row.day] = row.items;
    return week;
  }
}

module.exports = new ScheduleDbService();
