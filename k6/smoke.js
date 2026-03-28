/**
 * Smoke Test — sanidade mínima
 *
 * Objetivo: verificar que o endpoint está no ar e retorna 202
 * com carga mínima (1 VU, 30 s). Se falhar aqui, nenhum outro
 * teste adianta rodar.
 *
 * Executar: k6 run k6/smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_failed:   ["rate==0"],    // zero erros tolerados
    http_req_duration: ["p(99)<300"],  // 99% abaixo de 300 ms
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

export default function () {
  const payload = JSON.stringify({
    device_id:    "smoke-device-001",
    timestamp:    new Date().toISOString(),
    sensor_type:  "temperatura",
    reading_type: "analog",
    value:        25.0,
  });

  const res = http.post(`${BASE_URL}/telemetry`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "status 202": (r) => r.status === 202,
  });

  sleep(1);
}
