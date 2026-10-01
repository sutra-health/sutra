package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sutra-care/sutra/internal/adapters/chatwoot"
	"github.com/sutra-care/sutra/internal/adapters/jev"
	"github.com/sutra-care/sutra/internal/adapters/openmrs"
	"github.com/sutra-care/sutra/internal/adapters/remote"
	"github.com/sutra-care/sutra/internal/api"
	application "github.com/sutra-care/sutra/internal/app"
	"github.com/sutra-care/sutra/internal/auth"
	"github.com/sutra-care/sutra/internal/config"
	"github.com/sutra-care/sutra/internal/core"
	"github.com/sutra-care/sutra/internal/evidence"
	"github.com/sutra-care/sutra/internal/identity"
	"github.com/sutra-care/sutra/internal/inference"
	"github.com/sutra-care/sutra/internal/store"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	cfg := config.Load()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database unavailable", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		slog.Error("migration failed", "error", err)
		os.Exit(1)
	}
	authn, err := auth.New(ctx, cfg.AuthMode, cfg.AuthProvider, cfg.OIDCIssuer, cfg.OIDCJWKSURL, cfg.OIDCAudience, db)
	if err != nil {
		slog.Error("auth configuration invalid", "error", err)
		os.Exit(1)
	}
	openmrsAdapter := openmrs.New(cfg.OpenMRS.BaseURL, cfg.OpenMRS.Username, cfg.OpenMRS.Password, cfg.RequestTimeout)
	var patientDirectory core.PatientDirectory = openmrsAdapter
	var scheduler core.Scheduler = openmrsAdapter
	var remoteAdapter *remote.Adapter
	if cfg.ClinicalAdapter == "grpc" || cfg.SchedulerAdapter == "grpc" {
		remoteAdapter, err = remote.New(cfg.AdapterGRPCAddress)
		if err != nil {
			slog.Error("remote adapter configuration invalid", "error", err)
			os.Exit(1)
		}
		defer remoteAdapter.Close()
	}
	if cfg.ClinicalAdapter == "grpc" {
		patientDirectory = remoteAdapter
	} else if cfg.ClinicalAdapter != "openmrs" {
		slog.Error("unsupported clinical adapter", "value", cfg.ClinicalAdapter)
		os.Exit(1)
	}
	if cfg.SchedulerAdapter == "grpc" {
		scheduler = remoteAdapter
	} else if cfg.SchedulerAdapter != "openmrs" {
		slog.Error("unsupported scheduler adapter", "value", cfg.SchedulerAdapter)
		os.Exit(1)
	}
	chatwootAdapter := chatwoot.New(cfg.Chatwoot.BaseURL, cfg.Chatwoot.AccountID, cfg.Chatwoot.APIToken, cfg.RequestTimeout)
	jevAdapter := jev.New(cfg.JEV.URL, cfg.JEV.APIKey, cfg.JEV.Model, cfg.JEV.DataMode, cfg.JEV.MinConfidence, 2*time.Second)
	inferenceClient := inference.New(cfg.OCRServiceURL, cfg.STTServiceURL, 90*time.Second)
	workosClient := identity.NewWorkOS(cfg.WorkOSAPIKey)
	app := &application.Application{Patients: patientDirectory, Scheduler: scheduler, Conversations: chatwootAdapter, Classifier: jevAdapter, Events: db, Onboarding: db, Care: db, Lifecycle: db, Objects: evidence.LocalStore{Root: cfg.ObjectStoragePath}, Documents: db, OCR: inferenceClient, Speech: inferenceClient}
	handler := (&api.Server{App: app, Auth: authn, BootstrapToken: cfg.BootstrapToken, AuthProvider: cfg.AuthProvider, ChatwootWebhookSecret: cfg.Chatwoot.WebhookSecret, BindIdentity: func(r *http.Request, tenantID, provider, providerOrgID string) error {
		return db.BindTenantIdentity(r.Context(), tenantID, provider, providerOrgID)
	}, ProvisionIdentity: func(r *http.Request, tenantID, hospitalName, domain, adminEmail, returnURL string) (string, string, error) {
		if cfg.AuthProvider != "workos" {
			return "", "", nil
		}
		return workosClient.ProvisionHospital(r.Context(), tenantID, hospitalName, domain, adminEmail, returnURL)
	}}).Routes()
	server := &http.Server{Addr: ":" + cfg.Port, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 25 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		slog.Info("SUTRA API listening", "port", cfg.Port, "auth", cfg.AuthProvider, "mode", cfg.AuthMode)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err)
			cancel()
		}
	}()
	<-ctx.Done()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	_ = server.Shutdown(shutdownCtx)
}
