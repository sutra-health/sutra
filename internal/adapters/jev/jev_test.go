package jev

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonResponse(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(body))}
}

func TestClassifyUsesTypedChoiceContract(t *testing.T) {
	adapter := New("https://jev.test/v1/systemone", "test-key", "jev-latest", "synthetic", .85, time.Second)
	adapter.http = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		var body struct {
			Model     string `json:"model"`
			State     string `json:"state"`
			Questions map[string]struct {
				Type     string            `json:"type"`
				Criteria map[string]string `json:"criteria"`
			} `json:"questions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != "jev-latest" || body.Questions["route"].Type != "choice" || len(body.Questions["route"].Criteria) != 5 {
			t.Fatalf("unexpected typed request: %#v", body)
		}
		return jsonResponse(`{"model":"jev-2026-09-15","answers":{"route":{"type":"choice","choice":"scheduling","confidence":0.94,"probabilities":{"scheduling":0.94,"records":0.03,"plan_question":0.01,"administrative":0.01,"clinical_or_unknown":0.01}}},"usage":{"input_tokens":20,"output_tokens":1}}`), nil
	})}
	got, err := adapter.Classify(context.Background(), core.Context{}, "Please move my visit", []string{"plan_question", "scheduling", "records", "administrative", "clinical_or_unknown"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Label != "scheduling" || got.Confidence != .94 || got.Model != "jev-2026-09-15" || got.DeferredToHuman {
		t.Fatalf("unexpected classification: %#v", got)
	}
}

func TestProbeMakesSyntheticTypedRequest(t *testing.T) {
	calls := 0
	adapter := New("https://jev.test/v1/systemone", "test-key", "jev-latest", "synthetic", .85, time.Second)
	adapter.http = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return jsonResponse(`{"model":"jev-test","answers":{"route":{"type":"choice","choice":"scheduling","confidence":0.99,"probabilities":{"scheduling":0.99,"clinical_or_unknown":0.01}}},"usage":{"input_tokens":10,"output_tokens":1}}`), nil
	})}

	result, err := adapter.Probe(context.Background(), core.Context{})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Reachable || calls != 1 || len(result.Checks) != 2 {
		t.Fatalf("unexpected probe: %#v, calls=%d", result, calls)
	}
}

func TestProbeWithoutKeyIsExplicitlyOffline(t *testing.T) {
	result, err := New("https://api.typesafe.ai/v1/systemone", "", "jev-latest", "synthetic", .85, time.Second).Probe(context.Background(), core.Context{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Reachable || len(result.Warnings) < 2 {
		t.Fatalf("unexpected probe: %#v", result)
	}
}
