/**
 * Google Apps Script for CardTracker
 * Automated Bank & Credit Card Email Ingestion Engine
 *
 * Pipeline:
 * Bank / Credit Card Email -> Gmail -> Google Apps Script (Time-driven Trigger)
 * -> POST /api/ingest/email -> CardTracker Ingestion Pipeline -> Supabase
 *
 * Requirements & Behavior:
 * 1. Zero Cloudflare / Zero Custom Domain requirement.
 * 2. Reads configuration strictly from Script Properties:
 *    - CARDTRACKER_INGEST_URL: e.g. "https://your-app.vercel.app/api/ingest/email"
 *    - CARDTRACKER_INGESTION_TOKEN: Bearer token matching INGESTION_SECRET_TOKEN
 * 3. Gmail Search: from:(axisbank.com OR kiwi.money) -label:CardTracker/Processed newer_than:7d
 * 4. Extracts Gmail message body & message ID for 3-tier idempotency.
 * 5. ONLY applies "CardTracker/Processed" label AFTER receiving 2xx success from CardTracker.
 * 6. Never marks emails as read.
 */

// Configuration Constants
var LABEL_NAME = 'CardTracker/Processed';
var SEARCH_QUERY = 'from:(axisbank.com OR kiwi.money) -label:CardTracker/Processed newer_than:7d';
var BATCH_LIMIT = 25;

/**
 * Main polling function triggered periodically (e.g. every 5 to 10 minutes).
 */
function syncBankEmails() {
  var config = getScriptConfiguration();
  var label = getOrCreateLabel(LABEL_NAME);

  Logger.log('[CardTracker] Searching Gmail with query: ' + SEARCH_QUERY);
  var threads = GmailApp.search(SEARCH_QUERY, 0, BATCH_LIMIT);

  if (threads.length === 0) {
    Logger.log('[CardTracker] No unprocessed bank alert emails found.');
    return;
  }

  Logger.log('[CardTracker] Found ' + threads.length + ' unprocessed thread(s).');

  var successCount = 0;
  var failureCount = 0;

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();
    var threadSuccess = true;

    for (var j = 0; j < messages.length; j++) {
      var msg = messages[j];
      var messageId = msg.getId();
      var subject = msg.getSubject();
      var date = msg.getDate();
      var plainBody = msg.getPlainBody();
      var rawBody = plainBody && plainBody.trim().length > 0 ? plainBody : msg.getBody();

      if (!rawBody || rawBody.trim().length === 0) {
        Logger.log('[CardTracker] Warning: Empty body in message ' + messageId + '. Skipping.');
        continue;
      }

      var payload = {
        messageId: messageId,
        date: date.toISOString(),
        subject: subject,
        rawText: rawBody
      };

      var ingested = postToCardTracker(config.url, config.token, payload, messageId);
      if (!ingested) {
        threadSuccess = false;
        break; // Stop processing this thread on failure so it can be retried cleanly
      }
    }

    if (threadSuccess) {
      // ONLY apply processed label when all messages in the thread succeeded
      label.addToThread(thread);
      successCount++;
      Logger.log('[CardTracker] Successfully processed & labeled thread ID: ' + thread.getId());
    } else {
      failureCount++;
      Logger.log('[CardTracker] Left thread ID: ' + thread.getId() + ' unlabeled for automatic retry.');
    }
  }

  Logger.log('[CardTracker] Completed sync. Succeeded: ' + successCount + ', Failed/Retrying: ' + failureCount);
}

/**
 * Helper to dispatch HTTP POST request to CardTracker ingestion API.
 * Returns true only on HTTP 2xx and successful response.
 */
function postToCardTracker(url, token, payload, messageId) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      try {
        var json = JSON.parse(responseText);
        if (json.success) {
          Logger.log('[CardTracker] Ingested message ' + messageId + ' -> ' + (json.action || 'OK'));
          return true;
        } else {
          Logger.log('[CardTracker] API returned 2xx but success=false: ' + responseText);
          return false;
        }
      } catch (parseErr) {
        Logger.log('[CardTracker] Ingested message ' + messageId + ' (non-JSON response code ' + responseCode + ')');
        return true;
      }
    } else {
      Logger.log('[CardTracker] Error: Ingestion API returned HTTP ' + responseCode + ' for message ' + messageId + '. Response: ' + responseText);
      return false;
    }
  } catch (netErr) {
    Logger.log('[CardTracker] Network or Fetch exception for message ' + messageId + ': ' + netErr.toString());
    return false;
  }
}

/**
 * Validates and retrieves required script properties.
 */
function getScriptConfiguration() {
  var properties = PropertiesService.getScriptProperties();
  var url = properties.getProperty('CARDTRACKER_INGEST_URL');
  var token = properties.getProperty('CARDTRACKER_INGESTION_TOKEN');

  if (!url || url.trim().length === 0) {
    throw new Error('Missing Script Property "CARDTRACKER_INGEST_URL". Set it in Project Settings -> Script Properties.');
  }

  if (!token || token.trim().length === 0) {
    throw new Error('Missing Script Property "CARDTRACKER_INGESTION_TOKEN". Set it in Project Settings -> Script Properties.');
  }

  return {
    url: url.trim(),
    token: token.trim()
  };
}

/**
 * Retrieves existing Gmail label or creates it if absent.
 */
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    Logger.log('[CardTracker] Creating Gmail label: ' + labelName);
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

/**
 * Diagnostic helper function: Tests network connectivity and token authentication.
 * Run this function manually in the Apps Script editor to test your configuration.
 */
function testConnection() {
  var config = getScriptConfiguration();
  Logger.log('[CardTracker] Testing connection to: ' + config.url);

  var testPayload = {
    messageId: 'test-ping-' + new Date().getTime(),
    date: new Date().toISOString(),
    subject: 'Connectivity Health Check',
    rawText: 'CardTracker connectivity test ping'
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + config.token
    },
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(config.url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();

  Logger.log('[CardTracker] Response Code: ' + code);
  Logger.log('[CardTracker] Response Body: ' + text);

  if (code === 200) {
    Logger.log('[CardTracker] Connection test PASSED! Token is valid and API is responsive.');
  } else if (code === 401) {
    Logger.log('[CardTracker] Connection test FAILED: 401 Unauthorized. Check CARDTRACKER_INGESTION_TOKEN.');
  } else {
    Logger.log('[CardTracker] Connection test responded with status: ' + code);
  }
}

/**
 * Automation helper: Sets up a 5-minute recurring time-driven trigger for syncBankEmails.
 * Run this once manually from the Apps Script editor.
 */
function setupRecurringTrigger() {
  // Clear any existing triggers for syncBankEmails to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncBankEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new time-driven trigger every 5 minutes
  ScriptApp.newTrigger('syncBankEmails')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('[CardTracker] Recurring 5-minute trigger created successfully for syncBankEmails.');
}
