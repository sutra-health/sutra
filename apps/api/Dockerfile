FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY gen ./gen
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sutra-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/sutra-api /sutra-api
EXPOSE 4100
ENTRYPOINT ["/sutra-api"]
