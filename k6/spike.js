/**
 * Spike Test — rajada repentina
 *
 * Objetivo: simular um evento onde centenas de dispositivos IoT
 * acordam simultaneamente (ex: retorno de energia após queda) e
 * inundam o backend com telemetria. Verifica se o sistema aguenta
 * picos abruptos sem derrubar a fila RabbitMQ ou o backend.
 *
 * Perfil:
 *   baseline  →  10 VUs por 30 s  (tráfego normal)
 *   spike     → 300 VUs em  10 s  (spike: 30× o normal)
 *   sustenta  → 300 VUs por 1 min (aguenta o pico?)
 *   retorna   →  10 VUs em  10 s  (normaliza)
 *   estável   →  10 VUs por 30 s  (verifica recuperação)
 *
 * Executar: k6 run k6/spike.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const taxaErros = new Rate("taxa_erros");

export const options = {
  stages: [
    { duration: "30s", target: 10  },  // baseline
    { duration: "10s", target: 300 },  // spike abrupto
    { duration: "1m",  target: 300 },  // sustenta pico
    { duration: "10s", target: 10  },  // normaliza
    { duration: "30s", target: 10  },  // verifica recuperação
  ],
  thresholds: {
    // durante e após o spike, erros devem ficar abaixo de 10%
    taxa_erros:        ["rate<0.10"],
    // latência pode subir, mas p(99) deve voltar a < 2 s
    http_req_duration: ["p(99)<2000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const SENSORES = ["temperatura", "pressao", "umidade"];

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

export default function () {
  const payload = JSON.stringify({
    device_id:    `spike-device-${Math.floor(rand(1, 300))}`,
    timestamp:    new Date().toISOString(),
    sensor_type:  pick(SENSORES),
    reading_type: "analog",
    value:        parseFloat(rand(0, 100).toFixed(2)),
  });

  const res = http.post(`${BASE_URL}/telemetry`, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: "15s",
  });

  const ok = check(res, {
    "status 202": (r) => r.status === 202,
  });
  taxaErros.add(!ok);

  sleep(0.05); // mínimo para não sobrecarregar o cliente k6
}
