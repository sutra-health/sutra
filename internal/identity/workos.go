package identity

import (
	"context"
	"errors"

	workos "github.com/workos/workos-go/v10"
)

type WorkOS struct{ client *workos.Client }

func NewWorkOS(apiKey string) *WorkOS {
	if apiKey == "" {
		return &WorkOS{}
	}
	return &WorkOS{client: workos.NewClient(apiKey)}
}

func (w *WorkOS) ProvisionHospital(ctx context.Context, tenantID, hospitalName, domain, adminEmail, returnURL string) (string, string, error) {
	if w.client == nil {
		return "", "", errors.New("WorkOS management API is not configured")
	}
	organization, err := w.client.Organizations().GetByExternalID(ctx, tenantID)
	if err != nil {
		var notFound *workos.NotFoundError
		if !errors.As(err, &notFound) {
			return "", "", err
		}
		params := &workos.OrganizationsCreateParams{Name: hospitalName, ExternalID: &tenantID, Metadata: map[string]string{"sutra_tenant_id": tenantID}}
		if domain != "" {
			params.Domains = []string{domain}
		}
		organization, err = w.client.Organizations().Create(ctx, params)
		if err != nil {
			return "", "", err
		}
	}
	intent := workos.GenerateLinkIntentSSO
	portalParams := &workos.AdminPortalGenerateLinkParams{Organization: organization.ID, Intent: &intent}
	if returnURL != "" {
		portalParams.ReturnURL = &returnURL
		portalParams.SuccessURL = &returnURL
	}
	if adminEmail != "" {
		portalParams.ItContactEmails = []string{adminEmail}
	}
	link, err := w.client.AdminPortal().GenerateLink(ctx, portalParams)
	if err != nil {
		return organization.ID, "", err
	}
	return organization.ID, link.Link, nil
}
