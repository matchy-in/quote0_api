/**
 * Display Formatter Service
 * Formats events and bin collections for Quote/0 display
 */

const MAX_TITLE_LENGTH = 25;
const MAX_LINE_LENGTH = 29;
const MAX_LINES = 3;

class DisplayFormatterService {
  /**
   * Format display data from database objects (NEW - for push architecture)
   * @param {Array} events - Array of event objects from DynamoDB
   * @param {Array} binCollections - Array of bin collection objects from DynamoDB
   * @returns {Object} Formatted display object for Quote/0
   */
  formatDisplayFromDb(events, binCollections) {
    console.log('[DisplayFormatter] Formatting display from database objects');
    console.log(`Events: ${events.length}, Bin Collections: ${binCollections.length}`);

    const title = this.formatTitle(); // Returns today's date in YYYY/MM/DD format
    const signature = this.formatSignatureFromDb(binCollections);
    const message = this.formatMessage(events);

    console.log('[DisplayFormatter] Formatted display:');
    console.log(`  Title: "${title}"`);
    console.log(`  Signature: "${signature}"`);
    console.log(`  Message: "${message.replace(/\n/g, '\\n')}"`);

    return {
      refreshNow: true,
      title,
      message,
      signature
    };
  }

  /**
   * Format complete display data for Quote/0 (LEGACY - for API responses)
   * @param {Array} events - Array of event objects from DynamoDB
   * @param {Array} binCollections - Array of bin collection objects (with friendly names)
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
   * Format signature from database bin collections (NEW - for push architecture)
   * @param {Array} binCollections - Array of bin collection objects from DynamoDB
   * @returns {string} Formatted signature (max 29 chars)
   */
  formatSignatureFromDb(binCollections) {
    if (!binCollections || binCollections.length === 0) {
      console.log('[DisplayFormatter] No bin collections for tomorrow');
      return '';
    }

    // Service name mapping
    const SERVICE_MAPPING = {
      'Domestic Waste Collection Service': 'Grey bin',
      'Recycling Collection Service': 'Red bin',
      'Food Waste Collection Service': 'Food waste'
    };

    // Map service names to friendly bin types
    const binNames = binCollections
      .map(bc => SERVICE_MAPPING[bc.service] || bc.service)
      .filter((value, index, self) => self.indexOf(value) === index); // unique
    
    // Join with comma
    const binsText = binNames.join(', ');
    
    // Format as "collect {bins} tmr"
    const signature = `Collect ${binsText} tmr`;

    // Truncate to max length
    const truncated = signature.substring(0, MAX_LINE_LENGTH);
    
    console.log(`[DisplayFormatter] Signature: "${truncated}"`);
    
    return truncated;
  }

  /**
   * Format signature for bin collection reminder (LEGACY - for API responses)
   * @param {Array} binCollections - Array of bin collection objects (with friendly names)
   * @returns {string} Formatted signature (max 29 chars)
   */
  formatSignature(binCollections) {
    if (!binCollections || binCollections.length === 0) {
      console.log('[DisplayFormatter] No bin collections for tomorrow');
      return '';
    }

    // Extract bin names (already mapped to friendly names)
    const binNames = binCollections.map(bc => bc.service);
    
    // Join with comma
    const binsText = binNames.join(', ');
    
    // Format as "collect {bins} tmr"
    const signature = `Collect ${binsText} tmr`;

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
