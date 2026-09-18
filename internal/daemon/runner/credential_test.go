package runner

import (
	"strings"
	"testing"
)

// The installation token must reach git through the process environment only:
// a URL-embedded token ends up in argv, in .git/config, and in the error
// message that gets posted to the issue.
func TestCredentialEnvCarriesAuthHeader(t *testing.T) {
	env := Credential{Token: "ghs_secret"}.Env()
	joined := strings.Join(env, "\n")
	if !strings.Contains(joined, "GIT_CONFIG_COUNT=1") {
		t.Errorf("env = %v, want GIT_CONFIG_COUNT", env)
	}
	if !strings.Contains(joined, "GIT_CONFIG_KEY_0=http.https://github.com/.extraheader") {
		t.Errorf("env = %v, want the URL-scoped extraheader key", env)
	}
	// base64("x-access-token:ghs_secret")
	if !strings.Contains(joined, "Authorization: Basic eC1hY2Nlc3MtdG9rZW46Z2hzX3NlY3JldA==") {
		t.Errorf("env = %v, want the basic auth header", env)
	}
}

func TestCredentialEnvEmptyWithoutToken(t *testing.T) {
	if env := (Credential{}).Env(); env != nil {
		t.Errorf("env = %v, want nil so no empty header is injected", env)
	}
}

func TestGitHubCloneURLHasNoCredential(t *testing.T) {
	got := GitHubCloneURL("feifeifeimoon", "demo")
	if got != "https://github.com/feifeifeimoon/demo.git" {
		t.Errorf("GitHubCloneURL = %q", got)
	}
}

func TestRedactURLCredentials(t *testing.T) {
	in := "git clone https://x-access-token:ghs_leak@github.com/o/r.git: exit status 128"
	got := redactURLCredentials(in)
	if strings.Contains(got, "ghs_leak") {
		t.Errorf("redactURLCredentials = %q, still leaks the token", got)
	}
	if !strings.Contains(got, "https://github.com/o/r.git") {
		t.Errorf("redactURLCredentials = %q, want the URL kept", got)
	}
}
