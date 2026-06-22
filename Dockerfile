# syntax=docker/dockerfile:1

## Stage 1 — build the server binary
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /src

# Cache module downloads
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -ldflags "-s -w" -o /out/server ./cmd/server

## Stage 2 — minimal runtime
FROM gcr.io/distroless/static-debian12:nonroot

# Timezone data for the server
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/server /server

USER nonroot:nonroot
EXPOSE 8080

ENTRYPOINT ["/server"]
