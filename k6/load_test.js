import http from "k6/http";
import { check, sleep } from "k6";

// Configuração do teste: ramp-up → sustentação → ramp-down
export const options = {
  stages: [
    { duration: "30s", target: 20 },  // sobe gradualmente para 20 usuários
    { duration: "1m",  target: 20 },  // mantém 20 usuários por 1 minuto
    { duration: "20s", target: 0  },  // desce gradualmente
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],  // 95% das requisições abaixo de 500ms
    http_req_failed:   ["rate<0.01"],  // menos de 1% de erros
  },
};

const TIPOS_SENSOR = ["temperatura", "pressao", "umidade", "vibracao", "corrente"];
const TIPOS_LEITURA = ["analog", "discrete"];

function aleatorio(min, max) {
  return Math.random() * (max - min) + min;
}

function itemAleatorio(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

export default function () {
  const tipoLeitura = itemAleatorio(TIPOS_LEITURA);

  const payload = JSON.stringify({
    device_id:    `sensor-${Math.floor(aleatorio(1, 50))}`,
    timestamp:    new Date().toISOString(),
    sensor_type:  itemAleatorio(TIPOS_SENSOR),
    reading_type: tipoLeitura,
    value:        tipoLeitura === "discrete"
                    ? Math.round(aleatorio(0, 1))   // 0 ou 1
                    : parseFloat(aleatorio(0, 100).toFixed(2)),
  });

  const resposta = http.post("http://localhost:8080/telemetry", payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(resposta, {
    "status 202": (r) => r.status === 202,
  });

  sleep(0.1); // 100ms entre requisições por VU
}
