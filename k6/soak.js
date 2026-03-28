/**
 * Soak Test — resistência prolongada
 *
 * Objetivo: manter carga moderada por um período longo para detectar
 * vazamentos de memória, degradação gradual de latência, acúmulo na
 * fila RabbitMQ ou aumento de conexões abertas no PostgreSQL.
 *
 * Perfil: 20 VUs por 10 minutos (ajustável via env SOAK_DURATION).
 * Em ambiente de CI use SOAK_DURATION=2m; em staging, 30m ou mais.
 *
 * Executar:
 *   k6 run k6/soak.js
 *   k6 run -e SOAK_DURATION=30m k6/soak.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const taxaErros    = new Rate("taxa_erros");
const latenciaTend = new Trend("latencia_tendencia_ms", true);

const DURACAO = __ENV.SOAK_DURATION || "10m";

export const options = {
  stages: [
    { duration: "1m",     target: 20 },  // ramp-up
    { duration: DURACAO,  target: 20 },  // sustentação
    { duration: "30s",    target: 0  },  // ramp-down
  ],
  thresholds: {
    // latência não deve degradar: p(95) abaixo de 800 ms durante toda a execução
    http_req_duration: ["p(95)<800"],
    // menos de 1% de erros
    taxa_erros:        ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const SENSORES = ["temperatura", "pressao", "umidade", "vibracao", "corrente"];
const LEITURAS = ["analog", "discrete"];

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

export default function () {
  const tipoLeitura = pick(LEITURAS);

  const payload = JSON.stringify({
    device_id:    `soak-device-${Math.floor(rand(1, 50))}`,
    timestamp:    new Date().toISOString(),
    sensor_type:  pick(SENSORES),
    reading_type: tipoLeitura,
    value:        tipoLeitura === "discrete"
                    ? Math.round(rand(0, 1))
                    : parseFloat(rand(0, 100).toFixed(2)),
  });

  const res = http.post(`${BASE_URL}/telemetry`, payload, {
    headers: { "Content-Type": "application/json" },
  });

  latenciaTend.add(res.timings.duration);

  const ok = check(res, {
    "status 202": (r) => r.status === 202,
  });
  taxaErros.add(!ok);

  sleep(0.5); // 500 ms entre requests: simula dispositivos IoT reais
}
