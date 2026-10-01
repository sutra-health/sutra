package jev

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

type Adapter struct {
	url, apiKey, model, dataMode string
	minConfidence                float64
	http                         *http.Client
}

func New(url, apiKey, model, dataMode string, minConfidence float64, timeout time.Duration) *Adapter {
	return &Adapter{url: url, apiKey: apiKey, model: model, dataMode: dataMode, minConfidence: minConfidence, http: &http.Client{Timeout: timeout}}
}
func (a *Adapter) Manifest() core.Manifest {
	return core.Manifest{AdapterID: "ai.typesafe.jev", DisplayName: "TypeSafe Jev bounded classifier", Version: "0.1.0", Authority: "topic suggestion only; never clinical severity", Capabilities: []core.Capability{core.TypedClassificationCapability}, Metadata: map[string]any{"externalProcessor": true, "dataMode": a.dataMode}}
}
func (a *Adapter) Probe(ctx context.Context, call core.Context) (core.ProbeResult, error) {
	return core.ProbeResult{Reachable: a.apiKey != "", Manifest: a.Manifest(), Checks: []string{"configuration present"}, Warnings: []string{"Use synthetic/de-identified text until hospital privacy approval"}}, nil
}

func (a *Adapter) Classify(ctx context.Context, call core.Context, text string, labels []string) (core.TypedClassification, error) {
	if a.apiKey == "" {
		return core.TypedClassification{}, errors.New("Jev is not configured")
	}
	criteria := map[string]string{"plan_question": "exact question about a signed plan line", "scheduling": "book, cancel, reschedule or confirm an appointment", "records": "upload, locate or correct a document", "administrative": "registration, identity, language or consent", "clinical_or_unknown": "symptoms, medicines, medical advice, urgency or uncertainty"}
	payload := map[string]any{"model": a.model, "state": text, "questions": map[string]any{"route": map[string]any{"type": "choice", "instructions": "Classify operational subject only. Never assess severity. Symptoms and medicines must be clinical_or_unknown.", "criteria": criteria}}}
	encoded, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.url, bytes.NewReader(encoded))
	if err != nil {
		return core.TypedClassification{}, err
	}
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.http.Do(req)
	if err != nil {
		return core.TypedClassification{}, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return core.TypedClassification{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return core.TypedClassification{}, fmt.Errorf("Jev status %d", res.StatusCode)
	}
	var response struct {
		Answers map[string]struct {
			Value         string             `json:"value"`
			Choice        string             `json:"choice"`
			Confidence    float64            `json:"confidence"`
			Probabilities map[string]float64 `json:"probabilities"`
		} `json:"answers"`
		Model string `json:"model"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return core.TypedClassification{}, err
	}
	answer, ok := response.Answers["route"]
	if !ok {
		return core.TypedClassification{}, errors.New("Jev response omitted route answer")
	}
	label := answer.Value
	if label == "" {
		label = answer.Choice
	}
	valid := false
	for _, allowed := range labels {
		if label == allowed {
			valid = true
		}
	}
	if !valid {
		label = "clinical_or_unknown"
	}
	confidence := answer.Confidence
	if confidence == 0 {
		confidence = answer.Probabilities[label]
	}
	model := response.Model
	if model == "" {
		model = a.model
	}
	return core.TypedClassification{Label: label, Confidence: confidence, Probabilities: answer.Probabilities, Model: model, DeferredToHuman: !valid || confidence < a.minConfidence || label == "clinical_or_unknown"}, nil
}
