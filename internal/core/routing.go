package core

import (
	"context"
	"strings"
)

var allowedTopics = []string{"plan_question", "scheduling", "records", "administrative", "clinical_or_unknown"}

var defaultEmergencyPhrases = []string{
	"can't breathe", "cannot breathe", "unconscious", "heavy bleeding", "seizure",
	"सांस नहीं", "साँस नहीं", "बेहोश", "बहुत खून", "दौरा",
}

const EmergencyNotice = "This service cannot provide emergency care. Call the hospital casualty service or 112 now. The hospital team has also been alerted."

type Router struct {
	Classifier       TypedInference
	EmergencyPhrases []string
}

func (r Router) Decide(ctx context.Context, call Context, text string) (RouteDecision, error) {
	phrases := r.EmergencyPhrases
	if len(phrases) == 0 {
		phrases = defaultEmergencyPhrases
	}
	normalized := strings.ToLower(strings.TrimSpace(text))
	for _, phrase := range phrases {
		if strings.Contains(normalized, strings.ToLower(phrase)) {
			return RouteDecision{Topic: "possible_emergency", Destination: "duty_nurse_immediate", Confidence: 1, DecisionMethod: "clinician_approved_phrase_rule", DeferredToHuman: true, EmergencyNotice: EmergencyNotice}, nil
		}
	}
	if r.Classifier == nil {
		return RouteDecision{Topic: "clinical_or_unknown", Destination: "human_review_general", DecisionMethod: "classifier_unavailable", DeferredToHuman: true}, nil
	}
	classified, err := r.Classifier.Classify(ctx, call, text, allowedTopics)
	if err != nil {
		return RouteDecision{Topic: "clinical_or_unknown", Destination: "human_review_general", DecisionMethod: "classifier_failed", DeferredToHuman: true}, nil
	}
	destinations := map[string]string{
		"plan_question":       "signed_plan_lookup",
		"scheduling":          "scheduling_desk",
		"records":             "records_desk",
		"administrative":      "registration_desk",
		"clinical_or_unknown": "clinical_team",
	}
	destination, valid := destinations[classified.Label]
	deferred := classified.DeferredToHuman || !valid || classified.Label == "clinical_or_unknown"
	if !valid {
		destination = "human_review_general"
	}
	return RouteDecision{Topic: classified.Label, Destination: destination, Confidence: classified.Confidence, DecisionMethod: "typed_topic_suggestion", DeferredToHuman: deferred}, nil
}
