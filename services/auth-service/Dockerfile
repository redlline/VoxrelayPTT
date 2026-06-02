FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /app/auth-service ./cmd

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -g '' appuser

COPY --from=builder /app/auth-service /usr/local/bin/auth-service

USER appuser

EXPOSE 3001

ENTRYPOINT ["auth-service"]
