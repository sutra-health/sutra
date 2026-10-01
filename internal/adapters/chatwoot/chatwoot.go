package chatwoot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

type Adapter struct {
	baseURL, accountID, token string
	http                      *http.Client
}

func New(baseURL, accountID, token string, timeout time.Duration) *Adapter {
	return &Adapter{baseURL: baseURL, accountID: accountID, token: token, http: &http.Client{Timeout: timeout}}
}
func (a *Adapter) Manifest() core.Manifest {
	return core.Manifest{AdapterID: "io.chatwoot.whatsapp", DisplayName: "Chatwoot WhatsApp Cloud gateway", Version: "0.1.0", Authority: "conversation, agent assignment and delivery state", Capabilities: []core.Capability{core.Conversation}, Metadata: map[string]any{"transport": "Meta WhatsApp Cloud API", "openSourceInbox": true, "externalProcessor": "Meta"}}
}
func (a *Adapter) Probe(ctx context.Context, call core.Context) (core.ProbeResult, error) {
	result := core.ProbeResult{Manifest: a.Manifest()}
	if a.baseURL == "" || a.accountID == "" || a.token == "" {
		result.Warnings = []string{"Chatwoot is not configured"}
		return result, nil
	}
	var out any
	if err := a.do(ctx, http.MethodGet, "/api/v1/accounts/"+url.PathEscape(a.accountID)+"/agents", nil, &out); err != nil {
		return result, err
	}
	result.Reachable = true
	result.Checks = []string{"Chatwoot account API reachable"}
	return result, nil
}
func (a *Adapter) SendTemplate(ctx context.Context, call core.Context, conversationID, template, language string, parameters map[string]string) (core.ExternalReference, error) {
	payload := map[string]any{"message_type": "outgoing", "template_params": map[string]any{"name": template, "category": "UTILITY", "language": language, "processed_params": parameters}}
	var out map[string]any
	if err := a.do(ctx, http.MethodPost, a.conversationPath(conversationID)+"/messages", payload, &out); err != nil {
		return core.ExternalReference{}, err
	}
	id := fmt.Sprint(out["id"])
	if id == "<nil>" || id == "" {
		return core.ExternalReference{}, errors.New("Chatwoot returned no message id")
	}
	return core.ExternalReference{System: "chatwoot", ResourceType: "Message", ID: id}, nil
}
func (a *Adapter) AssignConversation(ctx context.Context, call core.Context, conversationID, teamID string, labels []string) error {
	if teamID != "" {
		if err := a.do(ctx, http.MethodPost, a.conversationPath(conversationID)+"/assignments", map[string]any{"team_id": teamID}, nil); err != nil {
			return err
		}
	}
	if len(labels) > 0 {
		return a.do(ctx, http.MethodPost, a.conversationPath(conversationID)+"/labels", map[string]any{"labels": labels}, nil)
	}
	return nil
}
func (a *Adapter) conversationPath(id string) string {
	return "/api/v1/accounts/" + url.PathEscape(a.accountID) + "/conversations/" + url.PathEscape(id)
}
func (a *Adapter) do(ctx context.Context, method, path string, body any, out any) error {
	if a.baseURL == "" {
		return errors.New("Chatwoot is not configured")
	}
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("api_access_token", a.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("Chatwoot status %d", res.StatusCode)
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}
