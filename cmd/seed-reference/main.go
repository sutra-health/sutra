package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/sutra-care/sutra/internal/config"
	"github.com/sutra-care/sutra/internal/store"
)

func main() {
	ctx := context.Background()
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
	if err := db.SeedMeenaReferenceScenario(ctx); err != nil {
		slog.Error("reference scenario failed", "error", err)
		os.Exit(1)
	}
	slog.Info("reference scenario ready", "tenant", store.ReferenceTenantID, "patientRef", store.ReferencePatientID)
}
