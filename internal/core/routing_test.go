package core

import (
	"context"
	"testing"
)

func TestEmergencyPhraseAlwaysDefersToHuman(t *testing.T) {
	got, err := (Router{}).Decide(context.Background(), Context{}, "Patient cannot breathe")
	if err != nil {
		t.Fatal(err)
	}
	if got.Topic != "possible_emergency" || !got.DeferredToHuman || got.EmergencyNotice == "" {
		t.Fatalf("unexpected decision: %#v", got)
	}
}

func TestNoClassifierFailsClosed(t *testing.T) {
	got, err := (Router{}).Decide(context.Background(), Context{}, "What time is my visit?")
	if err != nil {
		t.Fatal(err)
	}
	if !got.DeferredToHuman || got.Destination != "human_review_general" {
		t.Fatalf("unexpected decision: %#v", got)
	}
}
