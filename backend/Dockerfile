# Stage 1: compilação dos dois binários
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /bin/backend . && \
    go build -o /bin/consumer ./consumer

# Stage 2: imagem final do backend HTTP
FROM alpine:3.20 AS backend
COPY --from=builder /bin/backend /backend
ENTRYPOINT ["/backend"]

# Stage 3: imagem final do consumer
FROM alpine:3.20 AS consumer
COPY --from=builder /bin/consumer /consumer
ENTRYPOINT ["/consumer"]
