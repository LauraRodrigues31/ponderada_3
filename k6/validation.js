/**
 * Validation Test — regras de negócio
 *
 * Objetivo: verificar que o backend rejeita corretamente payloads
 * inválidos (400 Bad Request) e aceita os válidos (202 Accepted).
 * Não é teste de carga — usa 1 VU e roda uma vez cada cenário.
 *
 * Cobre as validações implementadas em backend/main.go:
 *   - device_id ausente       → 400
 *   - sensor_type ausente     → 400
 *   - reading_type ausente    → 400
 *   - reading_type inválido   → 400
 *   - JSON malformado         → 400
 *   - payload completo válido → 202
 *   - timestamp ausente       → 202 (backend preenche com time.Now())
 *
 * Executar: k6 run k6/validation.js
 */
import http from "k6/http";
import { check, group } from "k6";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1.00"],  // 100% dos checks devem passar
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const HEADERS  = { "Content-Type": "application/json" };

function post(payload) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return http.post(`${BASE_URL}/telemetry`, body, { headers: HEADERS });
}

export default function () {

  group("payload válido → 202", () => {
    const res = post({
      device_id:    "validation-device-001",
      timestamp:    new Date().toISOString(),
      sensor_type:  "temperatura",
      reading_type: "analog",
      value:        27.43,
    });
    check(res, { "202 Accepted": (r) => r.status === 202 });
  });

  group("timestamp ausente → 202 (backend preenche)", () => {
    const res = post({
      device_id:    "validation-device-001",
      sensor_type:  "temperatura",
      reading_type: "analog",
      value:        27.43,
    });
    check(res, { "202 Accepted sem timestamp": (r) => r.status === 202 });
  });

  group("device_id ausente → 400", () => {
    const res = post({
      timestamp:    new Date().toISOString(),
      sensor_type:  "temperatura",
      reading_type: "analog",
      value:        27.43,
    });
    check(res, { "400 sem device_id": (r) => r.status === 400 });
  });

  group("sensor_type ausente → 400", () => {
    const res = post({
      device_id:    "validation-device-001",
      timestamp:    new Date().toISOString(),
      reading_type: "analog",
      value:        27.43,
    });
    check(res, { "400 sem sensor_type": (r) => r.status === 400 });
  });

  group("reading_type ausente → 400", () => {
    const res = post({
      device_id:    "validation-device-001",
      timestamp:    new Date().toISOString(),
      sensor_type:  "temperatura",
      value:        27.43,
    });
    check(res, { "400 sem reading_type": (r) => r.status === 400 });
  });

  group("reading_type inválido → 400", () => {
    const res = post({
      device_id:    "validation-device-001",
      timestamp:    new Date().toISOString(),
      sensor_type:  "temperatura",
      reading_type: "continuous",   // inválido: deve ser analog ou discrete
      value:        27.43,
    });
    check(res, { "400 reading_type inválido": (r) => r.status === 400 });
  });

  group("JSON malformado → 400", () => {
    const res = http.post(`${BASE_URL}/telemetry`, "{invalid json}", { headers: HEADERS });
    check(res, { "400 JSON malformado": (r) => r.status === 400 });
  });

  group("reading_type discrete com valor float → 202", () => {
    const res = post({
      device_id:    "validation-device-002",
      timestamp:    new Date().toISOString(),
      sensor_type:  "presenca",
      reading_type: "discrete",
      value:        1.0,
    });
    check(res, { "202 discrete value 1.0": (r) => r.status === 202 });
  });

  group("reading_type discrete com valor zero → 202", () => {
    const res = post({
      device_id:    "validation-device-002",
      timestamp:    new Date().toISOString(),
      sensor_type:  "presenca",
      reading_type: "discrete",
      value:        0.0,
    });
    check(res, { "202 discrete value 0.0": (r) => r.status === 202 });
  });
}
