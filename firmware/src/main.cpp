#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID      = "Wokwi-GUEST";
const char* WIFI_PASSWORD  = "";
const char* BACKEND_URL    = "http://SEU_IP:8080/telemetry";
const char* DEVICE_ID      = "pico-w-001";

const int   PINO_BOTAO        = 15;
const int   INTERVALO_LEITURA = 5000;
const int   MAX_RETRIES       = 3;
const int   RETRY_DELAY       = 2000;
const int   DEBOUNCE_MS       = 50;
const int   AMOSTRAS_ADC      = 5;

bool  ultimoEstadoBotao  = HIGH;
bool  estadoEstavel      = HIGH;
unsigned long ultimoDebounce = 0;

bool conectarWiFi();
bool garantirWiFi();
float lerTemperatura();
float lerPresenca();
String gerarTimestamp();
bool enviarTelemetria(const char* sensorType, const char* readingType, float value);

void setup() {
  Serial1.begin(115200);
  delay(1000);
  pinMode(PINO_BOTAO, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial1.println("==============================================");
  Serial1.println("[INIT] Firmware Raspberry Pi Pico W");
  Serial1.print("[INIT] Device ID : "); Serial1.println(DEVICE_ID);
  Serial1.print("[INIT] Backend   : "); Serial1.println(BACKEND_URL);
  Serial1.println("==============================================");
  conectarWiFi();
}

void loop() {
  garantirWiFi();

  float temp = lerTemperatura();
  enviarTelemetria("temperatura", "analog", temp);

  float presenca = lerPresenca();
  enviarTelemetria("presenca", "discrete", presenca);

  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_BUILTIN, HIGH); delay(100);
    digitalWrite(LED_BUILTIN, LOW);  delay(100);
  }
  delay(INTERVALO_LEITURA);
}

bool conectarWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial1.print("[WiFi] Conectando");
  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    delay(500);
    Serial1.print(".");
    tentativas++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_BUILTIN, HIGH);
    Serial1.println("\n[WiFi] Conectado! IP: " + WiFi.localIP().toString());
    return true;
  }
  digitalWrite(LED_BUILTIN, LOW);
  Serial1.println("\n[WiFi] Falha ao conectar.");
  return false;
}

bool garantirWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial1.println("[WiFi] Reconectando...");
    WiFi.disconnect();
    delay(1000);
    return conectarWiFi();
  }
  return true;
}

float lerTemperatura() {
  float soma = 0.0f;
  for (int i = 0; i < AMOSTRAS_ADC; i++) {
    soma += analogReadTemp();
    delay(10);
  }
  float media = soma / AMOSTRAS_ADC;
  Serial1.print("[ADC] Temperatura: ");
  Serial1.print(media, 2);
  Serial1.println(" C");
  return media;
}

float lerPresenca() {
  bool leituraAtual = digitalRead(PINO_BOTAO);
  if (leituraAtual != ultimoEstadoBotao) {
    ultimoDebounce = millis();
  }
  if ((millis() - ultimoDebounce) > DEBOUNCE_MS) {
    if (leituraAtual != estadoEstavel) {
      estadoEstavel = leituraAtual;
    }
  }
  ultimoEstadoBotao = leituraAtual;
  float resultado = (estadoEstavel == LOW) ? 1.0f : 0.0f;
  Serial1.println("[GPIO] Presenca: " + String(resultado == 1.0f ? "PRESENTE" : "AUSENTE"));
  return resultado;
}

String gerarTimestamp() {
  unsigned long ms = millis();
  unsigned long s  = ms / 1000;
  unsigned long m  = s / 60;
  unsigned long h  = m / 60;
  char buf[25];
  snprintf(buf, sizeof(buf), "2026-01-01T%02lu:%02lu:%02luZ", h % 24, m % 60, s % 60);
  return String(buf);
}

bool enviarTelemetria(const char* sensorType, const char* readingType, float value) {
  JsonDocument doc;
  doc["device_id"]    = DEVICE_ID;
  doc["timestamp"]    = gerarTimestamp();
  doc["sensor_type"]  = sensorType;
  doc["reading_type"] = readingType;
  doc["value"]        = value;
  String payload;
  serializeJson(doc, payload);

  for (int tentativa = 0; tentativa < MAX_RETRIES; tentativa++) {
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(payload);
    if (httpCode >= 200 && httpCode < 300) {
      Serial1.println("[HTTP] OK status " + String(httpCode));
      http.end();
      return true;
    }
    Serial1.println("[HTTP] Erro: " + String(httpCode));
    http.end();
    if (tentativa < MAX_RETRIES - 1) delay(RETRY_DELAY);
  }
  Serial1.println("[HTTP] Falhou apos " + String(MAX_RETRIES) + " tentativas.");
  return false;
}
