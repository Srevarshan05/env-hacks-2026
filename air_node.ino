
/*
  Air Purifier Environmental Monitoring Transmitter

  Hardware:
    ESP32-WROOM-32
    Waveshare BME680
    SX1278 LoRa (433 MHz)

  Cloud:
    HTTPS -> API Gateway -> Lambda -> DynamoDB

  Telemetry interval: 10 seconds

  Required Arduino libraries:
    - Adafruit BME680 Library
    - Adafruit Unified Sensor
    - LoRa by Sandeep Mistry

  Keep secrets.h in this sketch's folder.
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include "secrets.h"

// =====================================================
// AWS HTTPS API
// =====================================================

const char API_URL[] =
    "https://qeq52cz63c.execute-api.ap-south-1.amazonaws.com/telemetry";

const char NODE_ID[] = "AirPurifierNode01";

// =====================================================
// TIMING
// =====================================================

constexpr unsigned long PUBLISH_INTERVAL_MS = 10000UL;
constexpr unsigned long WIFI_RETRY_MS = 10000UL;
constexpr unsigned long CLOCK_RETRY_MS = 30000UL;

// =====================================================
// BME680 I2C PINS
// =====================================================

#define I2C_SDA 21
#define I2C_SCL 22

Adafruit_BME680 bme;
bool bmeReady = false;

// =====================================================
// SX1278 LORA PINS
// =====================================================

#define LORA_SCK  18
#define LORA_MISO 19
#define LORA_MOSI 23
#define LORA_CS   5
#define LORA_RST  14
#define LORA_DIO0 2

#define LORA_FREQUENCY       433E6
#define LORA_SPREADING_FACTOR 7
#define LORA_BANDWIDTH       125E3
#define LORA_CODING_RATE     5
#define LORA_SYNC_WORD       0x12

bool loraReady = false;

// =====================================================
// HTTPS CLIENT
// =====================================================

WiFiClientSecure secureClient;

// =====================================================
// SYSTEM STATE
// =====================================================

unsigned long lastPublish = 0;
unsigned long sequenceNumber = 0;

unsigned long lastWiFiAttempt = 0;
unsigned long lastClockAttempt = 0;

bool clockReady = false;

// =====================================================
// WIFI CONNECTION
// =====================================================

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.printf("[WiFi] Connecting to '%s'...\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long started = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - started < 20000UL) {
    delay(250);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Connection failed.");
    return false;
  }

  Serial.println("[WiFi] Connected successfully.");
  Serial.print("[WiFi] IP address: ");
  Serial.println(WiFi.localIP());

  return true;
}

// =====================================================
// NTP CLOCK SYNCHRONIZATION
// Required to validate HTTPS server certificates.
// =====================================================

bool synchronizeClock() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  Serial.println("[NTP] Synchronizing system clock...");

  configTime(0, 0, "pool.ntp.org", "time.google.com");

  const unsigned long started = millis();

  while (millis() - started < 15000UL) {
    time_t now = time(nullptr);

    if (now > 1700000000) {
      Serial.print("[NTP] System time: ");
      Serial.print(ctime(&now));
      return true;
    }

    delay(250);
  }

  Serial.println("[NTP] Synchronization failed.");
  return false;
}

// =====================================================
// NETWORK DIAGNOSTICS
// =====================================================

void testNetwork() {
  Serial.println("[Network] Checking API hostname...");

  IPAddress address;

  if (WiFi.hostByName(
          "qeq52cz63c.execute-api.ap-south-1.amazonaws.com",
          address)) {
    Serial.print("[Network] DNS resolved: ");
    Serial.println(address);
  } else {
    Serial.println("[Network] DNS resolution failed.");
  }
}

// =====================================================
// READ BME680 AND CREATE JSON
// =====================================================

bool createTelemetry(char* payload, size_t payloadSize) {
  if (!bmeReady || !bme.performReading()) {
    Serial.println("[Sensor] ERROR: BME680 reading failed.");
    return false;
  }

  const float temperature = bme.temperature;
  const float humidity = bme.humidity;
  const float pressureHpa = bme.pressure / 100.0f;
  const float gasResistanceOhms = bme.gas_resistance;

  const unsigned long currentSequence = ++sequenceNumber;

  const int length = snprintf(
      payload,
      payloadSize,
      "{\"nodeId\":\"%s\","
      "\"sequence\":%lu,"
      "\"uptimeMs\":%lu,"
      "\"temperature\":%.2f,"
      "\"humidity\":%.2f,"
      "\"pressureHpa\":%.2f,"
      "\"gasResistanceOhms\":%.0f}",
      NODE_ID,
      currentSequence,
      millis(),
      temperature,
      humidity,
      pressureHpa,
      gasResistanceOhms
  );

  if (length < 0 ||
      static_cast<size_t>(length) >= payloadSize) {
    Serial.println("[Sensor] ERROR: JSON buffer too small.");
    return false;
  }

  Serial.println();
  Serial.println("========== BME680 READINGS ==========");

  Serial.printf("Temperature:     %.2f C\n", temperature);
  Serial.printf("Humidity:        %.2f %%\n", humidity);
  Serial.printf("Pressure:        %.2f hPa\n", pressureHpa);
  Serial.printf("Gas resistance:  %.0f ohms\n", gasResistanceOhms);

  Serial.print("JSON payload: ");
  Serial.println(payload);

  return true;
}

// =====================================================
// TRANSMIT DATA THROUGH LORA
// =====================================================

bool transmitLoRa(const char* payload) {
  if (!loraReady) {
    Serial.println("[LoRa] Not initialized.");
    return false;
  }

  LoRa.beginPacket();
  LoRa.print(payload);

  const int result = LoRa.endPacket();

  if (result == 1) {
    Serial.println("[LoRa] Transmission successful.");
    return true;
  }

  Serial.println("[LoRa] Transmission failed.");
  return false;
}

// =====================================================
// SEND DATA TO AWS THROUGH HTTPS
// =====================================================

bool publishHTTPS(const char* payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTPS] Wi-Fi unavailable. Skipping cloud upload.");
    return false;
  }

  if (!clockReady) {
    Serial.println("[HTTPS] System clock not synchronized.");
    return false;
  }

  HTTPClient http;

  Serial.println("[HTTPS] Sending telemetry to AWS...");

  if (!http.begin(secureClient, API_URL)) {
    Serial.println("[HTTPS] Failed to initialize HTTP client.");
    return false;
  }

  http.setConnectTimeout(10000);
  http.setTimeout(10000);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", API_TOKEN);

  const int httpCode = http.POST(
    (uint8_t*)payload,
    strlen(payload)
);

  bool success = false;

  if (httpCode > 0) {
    Serial.printf("[HTTPS] HTTP status: %d\n", httpCode);

    String responseBody = http.getString();

    Serial.print("[HTTPS] Server response: ");
    Serial.println(responseBody);

    // Lambda returns HTTP 200 after DynamoDB PutItem succeeds.
    if (httpCode == HTTP_CODE_OK &&
        responseBody.indexOf("\"success\": true") >= 0) {
      Serial.println("[AWS] Telemetry stored successfully.");
      success = true;
    } else {
      Serial.println("[AWS] Telemetry was not confirmed as stored.");
    }
  } else {
    Serial.printf(
        "[HTTPS] Request failed: %s\n",
        HTTPClient::errorToString(httpCode).c_str()
    );
  }

  http.end();

  return success;
}

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("========================================");
  Serial.println(" Air Purifier Environmental Transmitter");
  Serial.println(" ESP32 + BME680 + SX1278 + AWS HTTPS");
  Serial.println("========================================");

  // 1. Initialize BME680
  Wire.begin(I2C_SDA, I2C_SCL);

  if (bme.begin(0x77, &Wire) ||
      bme.begin(0x76, &Wire)) {

    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);

    bmeReady = true;

    Serial.println("[Sensor] BME680 initialized.");
  } else {
    Serial.println("[Sensor] ERROR: BME680 not detected.");
    Serial.println("[Sensor] Check I2C wiring and address.");

    while (true) {
      delay(1000);
    }
  }

  // 2. Initialize SX1278 LoRa
  SPI.begin(
      LORA_SCK,
      LORA_MISO,
      LORA_MOSI,
      LORA_CS
  );

  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("[LoRa] ERROR: SX1278 initialization failed.");

    while (true) {
      delay(1000);
    }
  }

  LoRa.setSpreadingFactor(LORA_SPREADING_FACTOR);
  LoRa.setSignalBandwidth(LORA_BANDWIDTH);
  LoRa.setCodingRate4(LORA_CODING_RATE);
  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.enableCrc();

  loraReady = true;

  Serial.println("[LoRa] SX1278 initialized at 433 MHz.");

  // 3. Configure HTTPS certificate validation.
  // ROOT_CA must contain the complete Amazon Root CA 1 certificate.
  secureClient.setCACert(ROOT_CA);
  secureClient.setHandshakeTimeout(15);

  Serial.println("[HTTPS] Root CA configured.");

  // 4. Connect to Wi-Fi and synchronize clock.
  if (connectWiFi()) {
    clockReady = synchronizeClock();

    if (clockReady) {
      testNetwork();
    }
  } else {
    Serial.println("[System] LoRa will operate without cloud access.");
  }

  lastWiFiAttempt = millis();
  lastClockAttempt = millis();
  lastPublish = millis();

  Serial.println("[System] Initialization complete.");
  Serial.println("[System] Telemetry interval: 10 seconds.");
  Serial.println("[System] Serial Monitor: 115200 baud.");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
  unsigned long now = millis();

  // 1. Recover Wi-Fi when disconnected.
  if (WiFi.status() != WL_CONNECTED &&
      now - lastWiFiAttempt >= WIFI_RETRY_MS) {

    lastWiFiAttempt = now;

    clockReady = false;

    if (connectWiFi()) {
      lastClockAttempt = 0;
    }
  }

  // 2. Synchronize clock after Wi-Fi connects.
  now = millis();

  if (WiFi.status() == WL_CONNECTED &&
      !clockReady &&
      (lastClockAttempt == 0 ||
       now - lastClockAttempt >= CLOCK_RETRY_MS)) {

    lastClockAttempt = millis();
    clockReady = synchronizeClock();

    if (clockReady) {
      testNetwork();
    }
  }

  // 3. Read sensor and transmit every 10 seconds.
  now = millis();

  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;

    char payload[384];

    if (createTelemetry(payload, sizeof(payload))) {
      // Local wireless transmission to the LoRa receiver.
      transmitLoRa(payload);

      // Cloud transmission through API Gateway HTTPS.
      publishHTTPS(payload);
    }

    Serial.println("----------------------------------------");
  }

  delay(2);
}