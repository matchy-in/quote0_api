/**
 * Quote/0 Canvas Service
 * Posts the daily schedule and the dashboard (weather, events, bin) to the Quote/0 Canvas API.
 * Docs: https://dot.mindreset.tech/docs/service/open/canvas_api
 *
 * Devices:
 *   QUOTE0_CANVAS_1_API -> .../device/48F6EE55503C/canvas  (schedule)
 *   QUOTE0_CANVAS_2_API -> .../device/48F6EE543F1C/canvas  (dashboard)
 */

const axios = require('axios');

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// Devices come from QUOTE0_CANVAS_1_API / QUOTE0_CANVAS_2_API; the serial number is the
// ".../device/<SERIAL>/canvas" part of each URL.
function configuredDevices() {
  return [process.env.QUOTE0_CANVAS_1_API, process.env.QUOTE0_CANVAS_2_API]
    .filter(Boolean)
    .map(url => ({ url, serial: (url.match(/\/device\/([^/]+)\/canvas/i) || [])[1] }))
    .filter(d => d.serial);
}

function resolveDevice(id) {
  const devices = configuredDevices();
  if (id === 1 || id === 2 || id === '1' || id === '2') {
    const url = process.env[`QUOTE0_CANVAS_${id}_API`];
    return devices.find(d => d.url === url) || null;
  }
  return devices.find(d => d.serial.toUpperCase() === String(id).toUpperCase()) || null;
}

// Which device shows what (serial numbers). Override with SCHEDULE_DEVICE / DASHBOARD_DEVICE.
function scheduleDevice() {
  return process.env.SCHEDULE_DEVICE || '48F6EE55503C';
}

function dashboardDevice() {
  return process.env.DASHBOARD_DEVICE || '48F6EE543F1C';
}

/** Serial numbers of the configured devices (used for validation messages). */
function deviceSerials() {
  return configuredDevices().map(d => d.serial);
}
// Literal text is embedded directly (no template helpers). Braces are removed so user text
// can never be read as template syntax.
function safeText(s) {
  return String(s).replace(/[{}]/g, '');
}

// Layout sizing (screen is small: 5 rows = 1 title row + 4 body rows).
// Increase/decrease FONT_SIZE and ROW_HEIGHT together if the text is too big or small.
const FONT_SIZE = 18;
const ROW_HEIGHT = 28;
const TIME_COL_WIDTH = 100;
const DATE_COL_WIDTH = 64;

/**
 * Build a Canvas screen: a title row (left text + right text) and body rows.
 * Mindreset rejected the `get` template helper for these nodes, so no template helpers or $for loops
 * are used: text is embedded as literals.
 *
 * @param {Object} spec
 * @param {string} spec.taskAlias
 * @param {string} spec.titleLeft
 * @param {string} spec.titleRight - shown at the far right of the title row
 * @param {Array<{label?: string, labelWidth?: number, text: string, bold?: boolean}>} spec.rows
 */
function buildScreen({ taskAlias, titleLeft, titleRight, rows }) {
  const text = { fontSize: `${FONT_SIZE}px`, lineHeight: `${ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` };
  const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  const titleRow = {
    type: 'div',
    props: {
      tw: 'flex flex-row w-full shrink-0 justify-between gap-[8px] font-bold',
      style: text,
      children: [
        { type: 'span', props: { tw: 'min-w-0', style: oneLine, children: safeText(titleLeft) } },
        { type: 'span', props: { tw: 'shrink-0', style: { whiteSpace: 'nowrap' }, children: safeText(titleRight) } }
      ]
    }
  };

  const bodyRows = rows.map((row) => {
    const children = [];
    if (row.label !== undefined) {
      children.push({
        type: 'span',
        props: {
          tw: 'shrink-0',
          style: { width: `${row.labelWidth || TIME_COL_WIDTH}px`, whiteSpace: 'nowrap' },
          children: safeText(row.label)
        }
      });
    }
    children.push({
      type: 'span',
      props: { tw: `flex-1 min-w-0${row.bold ? ' font-bold' : ''}`, style: oneLine, children: safeText(row.text) }
    });
    return {
      type: 'div',
      props: { tw: 'flex flex-row w-full shrink-0 gap-[8px]', style: text, children }
    };
  });

  return {
    refreshNow: true,
    taskAlias,
    data: { title: titleLeft },
    windowData: {
      default: [{
        type: 'div',
        props: {
          tw: 'flex flex-col w-full h-full min-w-0 min-h-0 bg-white text-black',
          children: [titleRow, ...bodyRows]
        }
      }]
    }
  };
}

/**
 * Schedule screen: "<date> <time>" + weekday, then 4 time | task rows.
 * @param {{date: string, time: string, weekday: string}} header
 * @param {Array<{time: string, task: string}>} items
 */
function buildPayload(header, items) {
  return buildScreen({
    taskAlias: 'Daily schedule',
    titleLeft: `${header.date} ${header.time}`,
    titleRight: header.weekday,
    rows: items.map(i => ({ label: i.time, labelWidth: TIME_COL_WIDTH, text: i.task }))
  });
}

/**
 * Dashboard screen: date + weather, 3 upcoming events (date | detail) and the bin reminder.
 * @param {{title: string, weather: string, events: Array<{date: string, text: string}>, bin: string}} d
 */
function buildDashboardPayload(d) {
  const events = d.events.length
    ? d.events.map(e => (e.date
      ? { label: e.date, labelWidth: DATE_COL_WIDTH, text: e.text } // future event: date + detail
      : { text: e.text }))                                          // today's event: detail only
    : [{ text: 'No upcoming events' }];
  return buildScreen({
    taskAlias: 'Dashboard',
    titleLeft: d.title,
    titleRight: d.weather,
    rows: [...events, { text: d.bin || '', bold: true }]
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function postToDevice(url, payload, attempt = 1) {
  const token = process.env.QUOTE0_AUTH_TOKEN;
  try {
    console.log('[Quote0Canvas] POST', url, 'attempt', attempt);
    console.log('[Quote0Canvas] Payload:', JSON.stringify(payload));
    const res = await axios.post(url, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Quote0-API/1.0'
      }
    });
    console.log('[Quote0Canvas] Response:', res.status, JSON.stringify(res.data));
    return { success: true, status: res.status, response: res.data };
  } catch (error) {
    const status = error.response?.status;
    console.error(`[Quote0Canvas] attempt ${attempt}/${MAX_RETRIES} failed:`, error.message, error.response?.data);
    if (attempt < MAX_RETRIES && (!status || status >= 500 || status === 429)) {
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      await sleep(retryAfter ? retryAfter * 1000 : INITIAL_RETRY_DELAY * 2 ** (attempt - 1));
      return postToDevice(url, payload, attempt + 1);
    }
    return { success: false, status, error: error.response?.data?.message || error.message };
  }
}

class Quote0CanvasService {
  /**
   * Post the schedule screen (default: SCHEDULE_DEVICE).
   * @param {{date: string, time: string, weekday: string}} header - title row
   * @param {Array<{time,task}>} items
   * @param {Array<string|number>} devices - serial numbers (default: SCHEDULE_DEVICE)
   * @returns {Promise<Object>} per-device results
   */
  async postSchedule(header, items, devices = [scheduleDevice()]) {
    return this.post(buildPayload(header, items), devices);
  }

  /**
   * Post the dashboard screen (default: DASHBOARD_DEVICE).
   * @returns {Promise<Object>} per-device results
   */
  async postDashboard(data, devices = [dashboardDevice()]) {
    return this.post(buildDashboardPayload(data), devices);
  }

  /**
   * Post a payload to devices.
   * @param {Object} payload
   * @param {Array<string|number>} devices - device serial numbers (e.g. "48F6EE543F1C");
   *        1 and 2 are accepted as shortcuts for QUOTE0_CANVAS_1_API / QUOTE0_CANVAS_2_API
   * @returns {Promise<Object>} results keyed by device serial number
   */
  async post(payload, devices) {
    const results = {};

    if (!process.env.QUOTE0_AUTH_TOKEN) {
      for (const id of devices) results[String(id)] = { success: false, error: 'QUOTE0_AUTH_TOKEN not configured' };
      return results;
    }

    for (const id of devices) {
      const device = resolveDevice(id);
      if (!device) {
        results[String(id)] = { success: false, error: `Unknown device ${id}. Configure it in QUOTE0_CANVAS_1_API / QUOTE0_CANVAS_2_API` };
        continue;
      }
      results[device.serial] = await postToDevice(device.url, payload);
    }
    return results;
  }
}
module.exports = new Quote0CanvasService();
module.exports.buildPayload = buildPayload;
module.exports.buildDashboardPayload = buildDashboardPayload;
module.exports.deviceSerials = deviceSerials;
module.exports.scheduleDevice = scheduleDevice;
module.exports.dashboardDevice = dashboardDevice;
