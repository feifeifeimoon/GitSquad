package runner

import (
	"encoding/base64"
	"regexp"
)

// Credential is the git HTTPS credential for one task run.
//
// It is applied to the git child process environment rather than the remote
// URL, so the installation token reaches neither argv nor .git/config. An
// embedded token is also wrong on its own terms: it expires after an hour and
// stays on disk, so a reused workspace would fail to fetch long before anyone
// thought to look at why.
type Credential struct {
	Token string
}

// Env returns the environment that authorises git's HTTPS requests.
//
// GIT_CONFIG_* (git >= 2.31) injects config into the child process only, and
// http.<url>.extraheader is what GitHub itself recommends for App tokens. The
// URL-scoped key keeps the header from being sent to any other host.
func (c Credential) Env() []string {
	if c.Token == "" {
		return nil
	}
	basic := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + c.Token))
	return []string{
		"GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=http.https://github.com/.extraheader",
		"GIT_CONFIG_VALUE_0=Authorization: Basic " + basic,
	}
}

// urlUserinfoRe matches the "user:password@" part of a URL.
var urlUserinfoRe = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]*@`)

// redactURLCredentials strips userinfo from any URL in a git error message.
// Nothing sensitive should be there — credentials travel in the environment —
// but git errors are posted to the issue and stored in the database, so a URL
// that ever does carry userinfo must not survive the trip.
func redactURLCredentials(s string) string {
	return urlUserinfoRe.ReplaceAllString(s, "$1")
}
