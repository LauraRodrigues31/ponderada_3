-- Tabela principal de leituras de sensores industriais
CREATE TABLE IF NOT EXISTS leituras_sensores (
    id              BIGSERIAL        PRIMARY KEY,
    dispositivo_id  VARCHAR(64)      NOT NULL,
    tipo_sensor     VARCHAR(64)      NOT NULL,
    tipo_leitura    VARCHAR(8)       NOT NULL CHECK (tipo_leitura IN ('analog', 'discrete')),
    valor           DOUBLE PRECISION NOT NULL,
    timestamp       TIMESTAMPTZ      NOT NULL,
    recebido_em     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Índice para consultas por dispositivo
CREATE INDEX IF NOT EXISTS idx_leituras_dispositivo_id
    ON leituras_sensores (dispositivo_id);

-- Índice para consultas por janela de tempo
CREATE INDEX IF NOT EXISTS idx_leituras_timestamp
    ON leituras_sensores (timestamp DESC);

-- Índice composto para o padrão mais comum: dispositivo + período
CREATE INDEX IF NOT EXISTS idx_leituras_dispositivo_tempo
    ON leituras_sensores (dispositivo_id, timestamp DESC);
