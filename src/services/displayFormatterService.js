/**
 * Display Formatter Service
 * Formats events and bin collections for Quote/0 display
 */

const MAX_TITLE_LENGTH = 25;
const MAX_LINE_LENGTH = 29;
const MAX_LINES = 3;

class DisplayFormatterService {
  /**
   * Format complete display data for Quote/0
   * @param {Array} events - Array of event objects from DynamoDB
   * @param {Array} binCollections - Array of bin collection objects
   * @returns {Object} Formatted display object
   */
  formatDisplay(events, binCollections) {
    const title = this.formatTitle();
    const message = this.formatMessage(events);
    const signature = this.formatSignature(binCollections);

    console.log('[DisplayFormatter] Formatted display:');
    console.log(`  Title: "${title}"`);
    console.log(`  Message: "${message.replace(/\n/g, '\\n')}"`);
    console.log(`  Signature: "${signature}"`);

    return {
      refreshNow: false,
      title,
      message,
      signature
    };
  }

  /**
   * Format title as today's date (YYYY/MM/DD)
   * @returns {string} Formatted title (max 25 chars)
   */
  formatTitle() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const title = `${year}/${month}/${day}`;
    
    // Ensure it doesn't exceed max length (shouldn't happen with date)
    return title.substring(0, MAX_TITLE_LENGTH);
  }

  /**
   * Format message from events (3 lines, 29 chars each)
   * @param {Array} events - Array of event objects
   * @returns {string} Formatted message with newlines
   */
  formatMessage(events) {
    const lines = [];
    
    if (!events || events.length === 0) {
      console.log('[DisplayFormatter] No events to display');
      // Return 3 empty lines
      return '\n\n';
    }

    // Process each event
    for (const eventObj of events) {
      if (lines.length >= MAX_LINES) break;
      
      const eventText = eventObj.event || '';
      
      // Split event text by existing newlines
      const eventLines = eventText.split('\n');
      
      for (const line of eventLines) {
        if (lines.length >= MAX_LINES) break;
        
        // Truncate line to max length
        const truncated = line.substring(0, MAX_LINE_LENGTH);
        lines.push(truncated);
      }
    }
    
    // Pad with empty lines if we have less than 3 lines
    while (lines.length < MAX_LINES) {
      lines.push('');
    }
    
    // Join lines with newline character
    return lines.join('\n');
  }

  /**
   * Format signature for bin collection reminder
   * @param {Array} binCollections - Array of bin collection objects
   * @returns {string} Formatted signature (max 29 chars)
   */
  formatSignature(binCollections) {
    if (!binCollections || binCollections.length === 0) {
      console.log('[DisplayFormatter] No bin collections for tomorrow');
      return '';
    }

    // Extract bin names
    const binNames = binCollections.map(bc => bc.service);
    
    // Join with comma
    const binsText = binNames.join(', ');
    
    // Format as "collect {bins} tmr"
    const signature = `collect ${binsText} tmr`;

    // Truncate to max length
    const truncated = signature.substring(0, MAX_LINE_LENGTH);
    
    console.log(`[DisplayFormatter] Signature: "${truncated}"`);
    
    return truncated;
  }

  /**
   * Validate display data constraints
   * @param {Object} displayData - Display data object to validate
   * @returns {Object} Validation result with errors if any
   */
  validateDisplay(displayData) {
    const errors = [];

    if (displayData.title.length > MAX_TITLE_LENGTH) {
      errors.push(`Title exceeds ${MAX_TITLE_LENGTH} characters`);
    }

    if (displayData.signature.length > MAX_LINE_LENGTH) {
      errors.push(`Signature exceeds ${MAX_LINE_LENGTH} characters`);
    }

    const messageLines = displayData.message.split('\n');
    if (messageLines.length !== MAX_LINES) {
      errors.push(`Message must have exactly ${MAX_LINES} lines`);
    }

    messageLines.forEach((line, index) => {
      if (line.length > MAX_LINE_LENGTH) {
        errors.push(`Message line ${index + 1} exceeds ${MAX_LINE_LENGTH} characters`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new DisplayFormatterService();
