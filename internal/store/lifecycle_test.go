package store

import "testing"

func TestValidCareStepTransition(t *testing.T) {
	tests := []struct {
		name    string
		current string
		next    string
		want    bool
	}{
		{name: "request booking", current: "planned", next: "awaiting_booking", want: true},
		{name: "scheduler confirms", current: "awaiting_booking", next: "booked", want: true},
		{name: "evidence received", current: "evidence_due", next: "evidence_received", want: true},
		{name: "human verifies", current: "evidence_received", next: "verified", want: true},
		{name: "doctor completes", current: "reviewed", next: "completed", want: true},
		{name: "idempotent retry", current: "booked", next: "booked", want: true},
		{name: "cannot skip source booking", current: "planned", next: "booked", want: false},
		{name: "cannot auto complete evidence", current: "evidence_received", next: "completed", want: false},
		{name: "completed is terminal", current: "completed", next: "planned", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := validCareStepTransition(test.current, test.next); got != test.want {
				t.Fatalf("validCareStepTransition(%q, %q) = %v; want %v", test.current, test.next, got, test.want)
			}
		})
	}
}
