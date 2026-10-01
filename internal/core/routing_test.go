package core

import (
	"context"
	"testing"
)

type routingClassifier struct{ result TypedClassification }

func (r routingClassifier) Manifest() Manifest { return Manifest{AdapterID: "test.classifier"} }
func (r routingClassifier) Probe(context.Context, Context) (ProbeResult, error) {
	return ProbeResult{Reachable: true}, nil
}
func (r routingClassifier) Classify(context.Context, Context, string, []string) (TypedClassification, error) {
	return r.result, nil
}

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

func TestTypedClassifierCanOnlySuggestApprovedStaffRoute(t *testing.T) {
	classifier := routingClassifier{result: TypedClassification{Label: "scheduling", Confidence: .94, Model: "jev-test"}}
	got, err := (Router{Classifier: classifier}).Decide(context.Background(), Context{}, "Please move my visit")
	if err != nil {
		t.Fatal(err)
	}
	if got.Destination != "scheduling_desk" || got.DecisionMethod != "typed_topic_suggestion" || got.ClassifierModel != "jev-test" || got.DeferredToHuman {
		t.Fatalf("unexpected decision: %#v", got)
	}
}

func TestEmergencyRuleBypassesTypedClassifier(t *testing.T) {
	classifier := routingClassifier{result: TypedClassification{Label: "administrative", Confidence: .99, Model: "should-not-run"}}
	got, err := (Router{Classifier: classifier}).Decide(context.Background(), Context{}, "She cannot breathe")
	if err != nil {
		t.Fatal(err)
	}
	if got.DecisionMethod != "clinician_approved_phrase_rule" || got.ClassifierModel != "" || got.Destination != "duty_nurse_immediate" {
		t.Fatalf("unexpected emergency decision: %#v", got)
	}
}
