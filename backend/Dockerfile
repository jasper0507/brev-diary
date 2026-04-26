FROM golang:1.26-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/diary-api ./cmd/api

FROM alpine:3.22

RUN addgroup -S diary && adduser -S diary -G diary
WORKDIR /app
COPY --from=builder /out/diary-api /app/diary-api
USER diary
EXPOSE 8080
CMD ["/app/diary-api"]
