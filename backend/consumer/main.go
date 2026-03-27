package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	amqp "github.com/rabbitmq/amqp091-go"
)

type Leitura struct {
	DispositivoID string    `json:"device_id"`
	Timestamp     time.Time `json:"timestamp"`
	TipoSensor    string    `json:"sensor_type"`
	TipoLeitura   string    `json:"reading_type"`
	Valor         float64   `json:"value"`
}

func main() {
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("erro ao conectar no postgres: %v", err)
	}
	defer db.Close()

	conn, err := amqp.Dial(os.Getenv("AMQP_URL"))
	if err != nil {
		log.Fatalf("erro ao conectar no RabbitMQ: %v", err)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("erro ao abrir canal: %v", err)
	}
	defer ch.Close()

	// Declara a fila também aqui, garante que ela exista mesmo se o consumer subir antes do backend
	_, err = ch.QueueDeclare("leituras", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("erro ao declarar fila: %v", err)
	}

	// autoAck=false: confirmação manual após inserção no banco
	mensagens, err := ch.Consume("leituras", "", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("erro ao registrar consumer: %v", err)
	}

	log.Println("consumer aguardando mensagens...")

	for msg := range mensagens {
		var l Leitura
		if err := json.Unmarshal(msg.Body, &l); err != nil {
			log.Printf("mensagem inválida, descartando: %v", err)
			msg.Nack(false, false) // sem requeue — mensagem corrompida
			continue
		}

		_, err = db.Exec(`
			INSERT INTO leituras_sensores (dispositivo_id, tipo_sensor, tipo_leitura, valor, timestamp)
			VALUES ($1, $2, $3, $4, $5)`,
			l.DispositivoID, l.TipoSensor, l.TipoLeitura, l.Valor, l.Timestamp,
		)
		if err != nil {
			log.Printf("erro ao inserir no banco, recolocando na fila: %v", err)
			msg.Nack(false, true) // requeue — pode ser erro transitório
			continue
		}

		msg.Ack(false)
		log.Printf("leitura salva: dispositivo=%s sensor=%s valor=%v", l.DispositivoID, l.TipoSensor, l.Valor)
	}
}
