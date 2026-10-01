package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port               string
	DatabaseURL        string
	AuthMode           string
	AuthProvider       string
	OIDCIssuer         string
	OIDCJWKSURL        string
	OIDCAudience       string
	WorkOSAPIKey       string
	BootstrapToken     string
	OpenMRS            OpenMRS
	Chatwoot           Chatwoot
	JEV                JEV
	OCRServiceURL      string
	STTServiceURL      string
	ABDMBridgeURL      string
	ObjectStoragePath  string
	ClinicalAdapter    string
	SchedulerAdapter   string
	AdapterGRPCAddress string
	RequestTimeout     time.Duration
}

type OpenMRS struct {
	BaseURL, Username, Password string
}

type Chatwoot struct {
	BaseURL, AccountID, APIToken, WebhookSecret string
}

type JEV struct {
	URL, APIKey, Model, DataMode string
	MinConfidence                float64
}

func Load() Config {
	return Config{
		Port: env("PORT", "4100"), DatabaseURL: env("DATABASE_URL", "postgres://sutra:sutra-dev-password@localhost:5432/sutra"),
		AuthMode: env("AUTH_MODE", "demo"), AuthProvider: env("AUTH_PROVIDER", "workos"), OIDCIssuer: env("OIDC_ISSUER", "https://api.workos.com/"), OIDCJWKSURL: os.Getenv("OIDC_JWKS_URL"), OIDCAudience: env("OIDC_AUDIENCE", "sutra-api"), WorkOSAPIKey: os.Getenv("WORKOS_API_KEY"), BootstrapToken: os.Getenv("SUTRA_BOOTSTRAP_TOKEN"),
		OpenMRS:       OpenMRS{BaseURL: strings.TrimRight(os.Getenv("OPENMRS_BASE_URL"), "/"), Username: os.Getenv("OPENMRS_USERNAME"), Password: os.Getenv("OPENMRS_PASSWORD")},
		Chatwoot:      Chatwoot{BaseURL: strings.TrimRight(os.Getenv("CHATWOOT_BASE_URL"), "/"), AccountID: os.Getenv("CHATWOOT_ACCOUNT_ID"), APIToken: os.Getenv("CHATWOOT_API_TOKEN"), WebhookSecret: os.Getenv("CHATWOOT_WEBHOOK_SECRET")},
		JEV:           JEV{URL: env("JEV_API_URL", "https://api.typesafe.ai/v1/systemone"), APIKey: os.Getenv("JEV_API_KEY"), Model: env("JEV_MODEL", "jev-latest"), DataMode: env("JEV_DATA_MODE", "synthetic"), MinConfidence: envFloat("JEV_MIN_CONFIDENCE", .85)},
		OCRServiceURL: os.Getenv("OCR_SERVICE_URL"), STTServiceURL: os.Getenv("STT_SERVICE_URL"), ABDMBridgeURL: os.Getenv("ABDM_BRIDGE_URL"), ObjectStoragePath: env("OBJECT_STORAGE_PATH", "./var/evidence"), ClinicalAdapter: env("CLINICAL_ADAPTER", "openmrs"), SchedulerAdapter: env("SCHEDULER_ADAPTER", "openmrs"), AdapterGRPCAddress: os.Getenv("ADAPTER_GRPC_ADDRESS"),
		RequestTimeout: time.Duration(envFloat("OUTBOUND_TIMEOUT_SECONDS", 5)) * time.Second,
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func envFloat(key string, fallback float64) float64 {
	value, err := strconv.ParseFloat(os.Getenv(key), 64)
	if err != nil {
		return fallback
	}
	return value
}
