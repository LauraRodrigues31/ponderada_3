package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Leitura struct {
	DispositivoID string    `json:"device_id"`
	Timestamp     time.Time `json:"timestamp"`
	TipoSensor    string    `json:"sensor_type"`
	TipoLeitura   string    `json:"reading_type"`
	Valor         float64   `json:"value"`
}

var canal *amqp.Channel

func main() {
	conn, err := amqp.Dial(os.Getenv("AMQP_URL"))
	if err != nil {
		log.Fatalf("erro ao conectar no RabbitMQ: %v", err)
	}
	defer conn.Close()

	canal, err = conn.Channel()
	if err != nil {
		log.Fatalf("erro ao abrir canal: %v", err)
	}
	defer canal.Close()

	_, err = canal.QueueDeclare("leituras", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("erro ao declarar fila: %v", err)
	}

	porta := os.Getenv("PORT")
	if porta == "" {
		porta = "8080"
	}

	http.HandleFunc("POST /telemetry", handleTelemetria)
	log.Printf("backend escutando na porta %s", porta)
	log.Fatal(http.ListenAndServe(":"+porta, nil))
}

func handleTelemetria(w http.ResponseWriter, r *http.Request) {
	var l Leitura
	if err := json.NewDecoder(r.Body).Decode(&l); err != nil {
		http.Error(w, "corpo da requisição inválido", http.StatusBadRequest)
		return
	}

	if l.DispositivoID == "" || l.TipoSensor == "" || l.TipoLeitura == "" {
		http.Error(w, "campos obrigatórios ausentes: device_id, sensor_type, reading_type", http.StatusBadRequest)
		return
	}
	if l.TipoLeitura != "analog" && l.TipoLeitura != "discrete" {
		http.Error(w, "reading_type deve ser 'analog' ou 'discrete'", http.StatusBadRequest)
		return
	}
	if l.Timestamp.IsZero() {
		l.Timestamp = time.Now().UTC()
	}

	corpo, err := json.Marshal(l)
	if err != nil {
		http.Error(w, "erro interno ao serializar", http.StatusInternalServerError)
		return
	}

	err = canal.Publish("", "leituras", false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         corpo,
	})
	if err != nil {
		http.Error(w, "erro ao publicar na fila", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
}
