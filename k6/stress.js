/**
 * Stress Test — limite do sistema
 *
 * Objetivo: aumentar a carga progressivamente até encontrar o ponto
 * onde o backend começa a falhar ou a latência explode. O backend está
 * limitado a 0.5 CPU / 256 MB RAM (docker-compose.yml), o que torna
 * o teste especialmente relevante.
 *
 * Etapas:
 *   0 → 50 VUs  em 1 min   (aquecimento)
 *  50 → 100 VUs em 2 min   (carga normal-alta)
 * 100 → 200 VUs em 2 min   (stress)
 * 200 → 300 VUs em 2 min   (stress intenso — espera-se degradação)
 * 300 → 0   VUs em 1 min   (recuperação)
 *
 * Executar: k6 run k6/stress.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const errosHttp    = new Counter("erros_http");
const taxaErros    = new Rate("taxa_erros");
const latenciaPost = new Trend("latencia_post_ms", true);

export const options = {
  stages: [
    { duration: "1m",  target: 50  },  // aquecimento
    { duration: "2m",  target: 100 },  // carga normal-alta
    { duration: "2m",  target: 200 },  // stress
    { duration: "2m",  target: 300 },  // stress intenso
    { duration: "1m",  target: 0   },  // recuperação
  ],
  thresholds: {
    // aviso (não falha o teste): 95% abaixo de 1 s durante stress
    http_req_duration: ["p(95)<1000"],
    // falha o teste se erros passarem de 5%
    taxa_erros:        ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const SENSORES  = ["temperatura", "pressao", "umidade", "vibracao", "corrente"];
const LEITURAS  = ["analog", "discrete"];

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

export default function () {
  const tipoLeitura = pick(LEITURAS);
  const deviceId    = `stress-device-${Math.floor(rand(1, 200))}`;

  const payload = JSON.stringify({
    device_id:    deviceId,
    timestamp:    new Date().toISOString(),
    sensor_type:  pick(SENSORES),
    reading_type: tipoLeitura,
    value:        tipoLeitura === "discrete"
                    ? Math.round(rand(0, 1))
                    : parseFloat(rand(0, 100).toFixed(2)),
  });

  const inicio = Date.now();
  const res = http.post(`${BASE_URL}/telemetry`, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: "10s",
  });
  latenciaPost.add(Date.now() - inicio);

  const ok = check(res, {
    "status 202":          (r) => r.status === 202,
    "resposta em < 2s":    (r) => r.timings.duration < 2000,
  });

  if (!ok || res.status !== 202) {
    errosHttp.add(1);
    taxaErros.add(1);
  } else {
    taxaErros.add(0);
  }

  // sem sleep: máxima pressão no servidor
}
