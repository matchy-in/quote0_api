/**
 * AWS Lambda Handlers for Quote0 API
 * 
 * Handles:
 * - POST /api/events - iPhone app creates events and updates Quote/0
 * - Scheduled updates - EventBridge triggers at 01:10 UTC daily
 */

const binCollectionDbService = require('../services/binCollectionDbService');
const dynamoDbService = require('../services/dynamoDbService');
const displayFormatterService = require('../services/displayFormatterService');
const quote0ClientService = require('../services/quote0ClientService');
const scheduledUpdateService = require('../services/scheduledUpdateService');

/**
 * POST /api/events
 * Creates a new event in DynamoDB and immediately updates Quote/0 display
 */
exports.createEvent = async (event) => {
  console.log('='.repeat(80));
  console.log('[POST /api/events] Request received');
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

    // Step 1: Create event in DynamoDB
    const createdEvent = await dynamoDbService.createEvent(normalizedDate, eventText);
    console.log('Event created successfully:', createdEvent);

    // Step 2-6: Immediately update Quote/0 display (run steps 3-7 from scheduled service)
    console.log('');
    console.log('Triggering Quote/0 update after event creation...');
    
    try {
      // Step 3: Query tomorrow's bin collections from database
      const binCollections = await binCollectionDbService.getTomorrowCollections();
      console.log(`Found ${binCollections.length} bin collections for tomorrow`);

      // Step 4: Query today's events
      const today = new Date().toISOString().split('T')[0];
      const events = await dynamoDbService.getEventsByDate(today);
      console.log(`Found ${events.length} events for today`);

      // Step 5: Format display data
      const displayData = displayFormatterService.formatDisplayFromDb(events, binCollections);
      console.log('Display data formatted');

      // Step 6: Push to Quote/0
      await quote0ClientService.updateDisplay(displayData);
      console.log('Quote/0 updated successfully');
    } catch (updateError) {
      console.error('Error updating Quote/0:', updateError.message);
      // Don't fail the request if Quote/0 update fails
      console.log('Event was created but Quote/0 update failed');
    }

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ...createdEvent,
        quote0_updated: true
      })
    };
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[POST /api/events] Error:', error.message);
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
 * POST /api/events/batch
 * Creates multiple events in DynamoDB and immediately updates Quote/0 display
 */
exports.createEventsBatch = async (event) => {
  console.log('='.repeat(80));
  console.log('[POST /api/events/batch] Request received');
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

    const { events } = body;
    console.log('Request data:', { eventCount: events?.length });

    // Validation - required fields
    if (!events || !Array.isArray(events)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing required field: events (must be an array)'
        })
      };
    }

    if (events.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'events array cannot be empty'
        })
      };
    }

    // Limit batch size to prevent overload
    if (events.length > 100) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Maximum 100 events per batch request'
        })
      };
    }

    // Validate each event
    const validationErrors = [];
    const normalizedEvents = [];

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      
      // Check required fields
      if (!evt.date) {
        validationErrors.push(`Event ${i}: Missing required field 'date'`);
        continue;
      }
      
      if (!evt.event) {
        validationErrors.push(`Event ${i}: Missing required field 'event'`);
        continue;
      }

      // Normalize date format (YYYY/MM/DD → YYYY-MM-DD)
      const normalizedDate = evt.date.replace(/\//g, '-');

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        validationErrors.push(`Event ${i}: Invalid date format '${evt.date}'. Use YYYY/MM/DD or YYYY-MM-DD`);
        continue;
      }

      // Validate event text length (max 87 chars for 3 lines of 29 chars)
      if (evt.event.length > 87) {
        validationErrors.push(`Event ${i}: Event text exceeds maximum length of 87 characters`);
        continue;
      }

      normalizedEvents.push({
        date: normalizedDate,
        event: evt.event
      });
    }

    // If any validation errors, return them
    if (validationErrors.length > 0) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unprocessable Entity',
          message: 'Validation errors in batch',
          errors: validationErrors
        })
      };
    }

    // Step 1: Create all events in DynamoDB
    console.log(`Creating ${normalizedEvents.length} events...`);
    const batchResult = await dynamoDbService.createEventsBatch(normalizedEvents);
    console.log('Batch creation complete:', {
      succeeded: batchResult.succeeded,
      failed: batchResult.failed
    });

    // Step 2-6: Immediately update Quote/0 display (run steps 3-7 from scheduled service)
    console.log('');
    console.log('Triggering Quote/0 update after batch creation...');
    
    let quote0Updated = false;
    try {
      // Step 3: Query tomorrow's bin collections from database
      const binCollections = await binCollectionDbService.getTomorrowCollections();
      console.log(`Found ${binCollections.length} bin collections for tomorrow`);

      // Step 4: Query today's events
      const today = new Date().toISOString().split('T')[0];
      const todayEvents = await dynamoDbService.getEventsByDate(today);
      console.log(`Found ${todayEvents.length} events for today`);

      // Step 5: Format display data
      const displayData = displayFormatterService.formatDisplayFromDb(todayEvents, binCollections);
      console.log('Display data formatted');

      // Step 6: Push to Quote/0
      await quote0ClientService.updateDisplay(displayData);
      console.log('Quote/0 updated successfully');
      quote0Updated = true;
    } catch (updateError) {
      console.error('Error updating Quote/0:', updateError.message);
      // Don't fail the request if Quote/0 update fails
      console.log('Events were created but Quote/0 update failed');
    }

    // Return response with batch results
    return {
      statusCode: batchResult.failed > 0 ? 207 : 201, // 207 Multi-Status if some failed
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: `Batch complete: ${batchResult.succeeded}/${batchResult.total} events created`,
        created: batchResult.created,
        errors: batchResult.errors,
        succeeded: batchResult.succeeded,
        failed: batchResult.failed,
        total: batchResult.total,
        quote0_updated: quote0Updated
      })
    };
  } catch (error) {
    console.error('='.repeat(80));
    console.error('[POST /api/events/batch] Error:', error.message);
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
