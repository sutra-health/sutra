.PHONY: generate build test run

generate:
	protoc -I proto \
		--go_out=gen/go --go_opt=paths=source_relative \
		--go-grpc_out=gen/go --go-grpc_opt=paths=source_relative \
		proto/sutra/adapter/v1/adapter.proto

build:
	go build ./...

test:
	go test ./...

run:
	go run ./cmd/api
