package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type Principal struct {
	Subject       string
	TenantID      string
	UnitID        string
	Roles         []string
	Permissions   []string
	ProviderOrgID string
}

type contextKey struct{}

func FromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(contextKey{}).(Principal)
	return principal, ok
}

type TenantResolver interface {
	ResolveTenant(context.Context, string, string) (string, error)
}

type Middleware struct {
	Mode, Provider string
	Verifier       *oidc.IDTokenVerifier
	Resolver       TenantResolver
}

func New(ctx context.Context, mode, provider, issuer, jwksURL, audience string, resolver TenantResolver) (*Middleware, error) {
	m := &Middleware{Mode: mode, Provider: provider, Resolver: resolver}
	if mode == "demo" {
		return m, nil
	}
	if issuer == "" || jwksURL == "" || audience == "" {
		return nil, errors.New("OIDC_ISSUER, OIDC_JWKS_URL and OIDC_AUDIENCE are required outside demo mode")
	}
	keys := oidc.NewRemoteKeySet(ctx, jwksURL)
	m.Verifier = oidc.NewVerifier(issuer, keys, &oidc.Config{ClientID: audience})
	return m, nil
}

func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m.Mode == "demo" {
			tenant := r.Header.Get("X-Sutra-Tenant")
			if tenant == "" {
				tenant = "00000000-0000-4000-8000-000000000001"
			}
			role := r.Header.Get("X-Sutra-Role")
			if role == "" {
				role = "admin"
			}
			principal := Principal{Subject: "demo-user", TenantID: tenant, Roles: []string{role}, Permissions: []string{"*"}}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, principal)))
			return
		}
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}
		token, err := m.Verifier.Verify(r.Context(), strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			http.Error(w, "invalid access token", http.StatusUnauthorized)
			return
		}
		var claims struct {
			Subject        string   `json:"sub"`
			OrganizationID string   `json:"org_id"`
			Role           string   `json:"role"`
			Roles          []string `json:"roles"`
			Permissions    []string `json:"permissions"`
			UnitID         string   `json:"sutra_unit_id"`
		}
		if err := token.Claims(&claims); err != nil || claims.Subject == "" || claims.OrganizationID == "" {
			http.Error(w, "required identity claims missing", http.StatusUnauthorized)
			return
		}
		tenantID, err := m.Resolver.ResolveTenant(r.Context(), m.Provider, claims.OrganizationID)
		if err != nil {
			http.Error(w, "organization is not onboarded", http.StatusForbidden)
			return
		}
		roles := claims.Roles
		if claims.Role != "" {
			roles = append(roles, claims.Role)
		}
		principal := Principal{Subject: claims.Subject, TenantID: tenantID, UnitID: claims.UnitID, Roles: roles, Permissions: claims.Permissions, ProviderOrgID: claims.OrganizationID}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, principal)))
	})
}

func RequireRoles(roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, role := range roles {
		allowed[role] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			principal, ok := FromContext(r.Context())
			if !ok {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}
			for _, role := range principal.Roles {
				if allowed[role] {
					next.ServeHTTP(w, r)
					return
				}
			}
			http.Error(w, "insufficient role", http.StatusForbidden)
		})
	}
}
