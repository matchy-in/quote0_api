/**
 * AWS Lambda Handlers for Quote0 API
 * 
 * Handles:
 * - POST /api/events - iPhone app creates events and updates Quote/0
 * - Scheduled updates - EventBridge triggers at 01:10 UTC daily
 */

const dynamoDbService = require('../services/dynamoDbService');
const dashboardService = require('../services/dashboardService');
const scheduledUpdateService = require('../services/scheduledUpdateService');

const API_AUTH_TOKEN = process.env.API_AUTH_TOKEN;

function authorize(event) {
  if (!API_AUTH_TOKEN) return null;

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Unauthorized', message: 'Missing Authorization header' })
    };
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (token !== API_AUTH_TOKEN) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Forbidden', message: 'Invalid API token' })
    };
  }

  return null;
}

/**
 * POST /api/events
 * Creates a new event in DynamoDB and immediately updates Quote/0 display
 */
exports.createEvent = async (event) => {
  console.log('='.repeat(80));
  console.log('[POST /api/events] Request received');
  console.log('='.repeat(80));

  const authError = authorize(event);
  if (authError) return authError;

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

    // Validate event text length (max 84 chars for 3 lines of 27 chars + 3 line breaks)
    if (eventText.length > 84) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unprocessable Entity',
          message: 'Event text exceeds maximum length of 84 characters'
        })
      };
    }
    
    // Validate individual line lengths
    const lines = eventText.split('\n');
    for (const line of lines) {
      if (line.length > 27+1) { // 27 chars + 1 for line break logic
        return {
          statusCode: 422,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Unprocessable Entity',
            message: 'A line of event text exceeds maximum length of 27 characters'
          })
        };
      }
    }

    // Step 1: Check if an event already exists for this date
    console.log(`Checking for existing events on ${normalizedDate}...`);
    const createdEvent = await dynamoDbService.upsertEvent(normalizedDate, eventText);
    console.log('Event processed successfully:', createdEvent);

    // Step 2-6: Immediately update Quote/0 display (run steps 3-7 from scheduled service)
    console.log('');
    console.log('Triggering Quote/0 update after event creation...');
    
    try {
      // Rebuild the dashboard (weather, 3 upcoming events, bin reminder) and push via Canvas API
      const { results } = await dashboardService.refresh();
      if (!Object.values(results).every(r => r.success)) throw new Error(JSON.stringify(results));
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

  const authError = authorize(event);
  if (authError) return authError;

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

      // Validate event text length (max 37 chars for 3 lines of 27 chars + 3 line breaks)
      if (evt.event.length > 84) {
        validationErrors.push(`Event ${i}: Event text exceeds maximum length of 84 characters`);
        continue;
      }

      // Validate individual line lengths
      const lines = evt.event.split('\n');
      let lineErrorFound = false;

      for (const [index, line] of lines.entries()) {
        if (line.length > 27+1) { // 27 + 1
          validationErrors.push(`Event ${i}: Line ${index + 1} exceeds maximum length of 27 characters`);
          lineErrorFound = true;
          break; // We found an error for this event, stop checking lines and move on
        }
      }
      
      if (lineErrorFound) continue; // Skip pushing to normalizedEvents and go to next event

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
      // Rebuild the dashboard (weather, 3 upcoming events, bin reminder) and push via Canvas API
      const { results } = await dashboardService.refresh();
      if (!Object.values(results).every(r => r.success)) throw new Error(JSON.stringify(results));
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


// ---------------------------------------------------------------------------
// Weekly schedule endpoints
// ---------------------------------------------------------------------------

const scheduleDbService = require('../services/scheduleDbService');
const quote0CanvasService = require('../services/quote0CanvasService');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  try {
    return { body: event.body ? JSON.parse(event.body) : {} };
  } catch (e) {
    return { error: json(400, { error: 'Bad Request', message: 'Invalid JSON in request body' }) };
  }
}

// Validate { time: "1500-1530", task: "..." } list; returns error string or null
function validateItems(items, label) {
  if (!Array.isArray(items)) return `${label}: must be an array`;
  if (items.length > 20) return `${label}: maximum 20 items per day`;
  for (const [i, it] of items.entries()) {
    if (!it || typeof it.time !== 'string' || typeof it.task !== 'string' || !it.time || !it.task) {
      return `${label}[${i}]: requires string fields 'time' and 'task'`;
    }
    if (!/^\d{4}-\d{4}$/.test(it.time)) return `${label}[${i}]: time must look like 1500-1530`;
    if (it.task.length > 60) return `${label}[${i}]: task exceeds 60 characters`;
  }
  return null;
}

// Choose up to `max` rows: start at the first item that has not finished yet (end > now),
// and if fewer than `max` remain, back-fill with the preceding items so the screen stays full.
function selectRows(items, nowHHMM, max) {
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  let start = sorted.findIndex(it => it.time.split('-')[1] > nowHHMM);
  if (start === -1) start = Math.max(0, sorted.length - max); // day is over: show the last rows
  start = Math.max(0, Math.min(start, sorted.length - max));
  return sorted.slice(start, start + max);
}

/**
 * POST /api/schedule
 * Body: { "monday": [{ "time": "1500-1530", "task": "tidy up lunch bag" }], ..., "sunday": [...] }
 * Days omitted are left unchanged; send [] to clear a day.
 */
exports.saveSchedule = async (event) => {
  const authError = authorize(event);
  if (authError) return authError;

  const { body, error } = parseBody(event);
  if (error) return error;

  const schedule = body.schedule || body;
  const provided = scheduleDbService.days.filter(d => schedule[d] !== undefined);
  if (provided.length === 0) {
    return json(400, { error: 'Bad Request', message: 'Provide at least one day: ' + scheduleDbService.days.join(', ') });
  }

  const errors = provided.map(d => validateItems(schedule[d], d)).filter(Boolean);
  if (errors.length) return json(422, { error: 'Unprocessable Entity', errors });

  try {
    const saved = await scheduleDbService.saveSchedule(schedule);
    return json(201, { message: 'Schedule saved', days: saved });
  } catch (e) {
    console.error('[POST /api/schedule] Error:', e);
    return json(500, { error: 'Internal server error', message: e.message });
  }
};

/**
 * GET /api/schedule            -> whole week
 * GET /api/schedule?day=monday -> single day
 */
exports.getSchedule = async (event) => {
  const authError = authorize(event);
  if (authError) return authError;

  try {
    const day = event.queryStringParameters?.day?.toLowerCase();
    if (day) {
      if (!scheduleDbService.days.includes(day)) {
        return json(400, { error: 'Bad Request', message: 'day must be one of: ' + scheduleDbService.days.join(', ') });
      }
      return json(200, { day, items: await scheduleDbService.getDay(day) });
    }
    return json(200, { schedule: await scheduleDbService.getWeek() });
  } catch (e) {
    console.error('[GET /api/schedule] Error:', e);
    return json(500, { error: 'Internal server error', message: e.message });
  }
};

// Returns a 400 response if `devices` is not an array of known device serial numbers, else null
function validateDevices(devices) {
  const serials = quote0CanvasService.deviceSerials().map(s => s.toUpperCase());
  const isKnown = d => d === 1 || d === 2 || serials.includes(String(d).toUpperCase());
  if (!Array.isArray(devices) || devices.length === 0 || !devices.every(isKnown)) {
    return json(400, {
      error: 'Bad Request',
      message: `devices must be an array of device serial numbers: ${serials.join(', ')}`
    });
  }
  return null;
}

/**
 * POST /api/events/publish
 * Rebuilds the dashboard (weather, next 3 events from today, tomorrow's bin) and pushes it to
 * Quote/0 via the Canvas API without creating any event.
 * Body (required): { "devices": ["48F6EE55503C"] } - device serial numbers; 400 if missing.
 */
exports.publishEvents = async (event) => {
  const authError = authorize(event);
  if (authError) return authError;

  const { body, error } = parseBody(event);
  if (error) return error;

  const devices = body.devices;
  if (devices === undefined) {
    return json(400, {
      error: 'Bad Request',
      message: `Missing required field: devices (array of device serial numbers: ${quote0CanvasService.deviceSerials().join(', ')})`
    });
  }
  const devicesError = validateDevices(devices);
  if (devicesError) return devicesError;

  try {
    const { data, results } = await dashboardService.refresh(undefined, devices);
    const allOk = Object.values(results).every(r => r.success);
    return json(allOk ? 200 : 502, { dashboard: data, results });
  } catch (e) {
    console.error('[POST /api/events/publish] Error:', e);
    return json(500, { error: 'Internal server error', message: e.message });
  }
};
/**
 * POST /api/schedule/publish
 * Body (all optional): { "date": "2026-11-20", "day": "friday", "devices": [1, 2] }
 * Defaults to today (Europe/London) and the schedule device (SCHEDULE_DEVICE). Pushes date + 2-column table to Canvas API.
 */
exports.publishSchedule = async (event) => {
  const authError = authorize(event);
  if (authError) return authError;

  const { body, error } = parseBody(event);
  if (error) return error;

  try {
    let date = body.date ? String(body.date).replace(/\//g, '-') : null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(400, { error: 'Bad Request', message: 'Invalid date format. Use YYYY/MM/DD or YYYY-MM-DD' });
    }
    if (!date) {
      date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    }

    let day = body.day ? String(body.day).toLowerCase() : null;
    if (!day) {
      day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
    }
    if (!scheduleDbService.days.includes(day)) {
      return json(400, { error: 'Bad Request', message: 'day must be one of: ' + scheduleDbService.days.join(', ') });
    }

    const devices = body.devices || [quote0CanvasService.scheduleDevice()];
    const devicesError = validateDevices(devices);
    if (devicesError) return devicesError;

    const items = await scheduleDbService.getDay(day);
    if (items.length === 0) {
      return json(404, { error: 'Not Found', message: `No schedule saved for ${day}` });
    }

    // Pick the 4 rows to show: the current/next item and the ones after it.
    // `time` (HHMM or HH:MM) overrides "now" for testing; a non-today `date` starts from the first item.
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date()).split(':');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    let nowHHMM = parts.join('');
    let displayHHMM = nowHHMM; // shown in the title row (real clock unless a "time" override is given)
    if (body.time) {
      nowHHMM = String(body.time).replace(':', '');
      displayHHMM = nowHHMM;
      if (!/^\d{4}$/.test(nowHHMM)) {
        return json(400, { error: 'Bad Request', message: 'time must look like 1530 or 15:30' });
      }
    } else if (date !== today) {
      nowHHMM = '0000';
    }
    const shown = selectRows(items, nowHHMM, 4);

    const header = {
      date,
      time: `${displayHHMM.slice(0, 2)}:${displayHHMM.slice(2)}`,
      weekday: day.charAt(0).toUpperCase() + day.slice(1)
    };
    const results = await quote0CanvasService.postSchedule(header, shown, devices);
    const allOk = Object.values(results).every(r => r.success);

    return json(allOk ? 200 : 502, { date, day, now: nowHHMM, shown, items, results });
  } catch (e) {
    console.error('[POST /api/schedule/publish] Error:', e);
    return json(500, { error: 'Internal server error', message: e.message });
  }
};


/**
 * Hourly dashboard refresh
 * Triggered by EventBridge every hour. Rebuilds the dashboard (weather, next 3 events,
 * tomorrow's bin) from stored data and pushes it to the dashboard device (DASHBOARD_DEVICE).
 * Unlike scheduledUpdate it does not call the Reading Council API.
 */
exports.scheduledPublishEvents = async (event) => {
  console.log('[Hourly Dashboard] Triggered by EventBridge at', new Date().toISOString());
  try {
    const { data, results } = await dashboardService.refresh();
    const success = Object.values(results).every(r => r.success);
    console.log('[Hourly Dashboard] Result:', JSON.stringify({ success, results }));
    return { statusCode: success ? 200 : 502, body: JSON.stringify({ success, dashboard: data, results }) };
  } catch (error) {
    console.error('[Hourly Dashboard] Fatal error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: error.message }) };
  }
};
