/**
 * AWS Lambda Handlers for Quote0 API
 * 
 * Handles:
 * - GET /api/display - Quote/0 device pulls display data
 * - PUT /api/events - iPhone app creates events
 * - Scheduled updates - EventBridge triggers at 01:10, 07:10, 12:10, 17:10
 */

const binCollectionService = require('../services/binCollectionService');
const dynamoDbService = require('../services/dynamoDbService');
const displayFormatterService = require('../services/displayFormatterService');
const quote0ClientService = require('../services/quote0ClientService');
const scheduledUpdateService = require('../services/scheduledUpdateService');

/**
 * GET /api/display
 * Returns formatted display data for Quote/0 device
 */
exports.getDisplay = async (event) => {
  console.log('='.repeat(80));
  console.log('[GET /api/display] Request received');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('='.repeat(80));

  try {
    // Fetch tomorrow's bin collections
    const binCollections = await binCollectionService.getTomorrowCollections();
    console.log(`Found ${binCollections.length} bin collections for tomorrow`);

    // Query today's events from DynamoDB
    const today = new Date().toISOString().split('T')[0];
    const events = await dynamoDbService.getEventsByDate(today);
    console.log(`Found ${events.length} events for today (${today})`);

    // Format display data
    const displayData = displayFormatterService.formatDisplay(events, binCollections);
    console.log('Display data:', JSON.stringify(displayData, null, 2));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(displayData)
    };
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[GET /api/display] Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

/**
 * PUT /api/events
 * Creates a new event in DynamoDB
 */
exports.createEvent = async (event) => {
  console.log('='.repeat(80));
  console.log('[PUT /api/events] Request received');
  console.log('='.repeat(80));

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid JSON in request body'
        })
      };
    }

    const { date, event: eventText } = body;
    console.log('Request data:', { date, event: eventText });

    // Validation - required fields
    if (!date) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing required field: date'
        })
      };
    }

    if (!eventText) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing required field: event'
        })
      };
    }

    // Normalize date format (YYYY/MM/DD → YYYY-MM-DD)
    const normalizedDate = date.replace(/\//g, '-');
    console.log('Normalized date:', normalizedDate);

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid date format. Use YYYY/MM/DD or YYYY-MM-DD'
        })
      };
    }

    // Validate event text length (max 87 chars for 3 lines of 29 chars)
    if (eventText.length > 87) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unprocessable Entity',
          message: 'Event text exceeds maximum length of 87 characters'
        })
      };
    }

    // Create event in DynamoDB
    const createdEvent = await dynamoDbService.createEvent(normalizedDate, eventText);
    console.log('Event created successfully:', createdEvent);

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(createdEvent)
    };
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[PUT /api/events] Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

/**
 * Scheduled Update
 * Triggered by EventBridge at 01:10, 07:10, 12:10, 17:10 UTC
 */
exports.scheduledUpdate = async (event) => {
  console.log('='.repeat(80));
  console.log('[Scheduled Update] Triggered by EventBridge');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Time:', new Date().toISOString());
  console.log('='.repeat(80));

  try {
    const result = await scheduledUpdateService.executeUpdate();
    
    console.log('='.repeat(80));
    console.log('[Scheduled Update] Result:', result);
    console.log('='.repeat(80));
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[Scheduled Update] Fatal error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80));
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
