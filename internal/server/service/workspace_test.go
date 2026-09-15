package service

import "testing"

func TestDeriveSlug(t *testing.T) {
	cases := []struct{ name, want string }{
		{"Acme Platform", "acme-platform"},
		{"  Trailing  Spaces  ", "trailing-spaces"},
		{"GTS/Console", "gts-console"},
		{"v2.0 release", "v2-0-release"},
		// No letters or digits anywhere: the caller reports an invalid name
		// rather than inventing a placeholder slug.
		{"!!!", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := deriveSlug(c.name); got != c.want {
			t.Errorf("deriveSlug(%q) = %q, want %q", c.name, got, c.want)
		}
	}
}

// Every top-level route the frontend serves has to be reserved here too.
//
// The two lists are duplicated on purpose — the server cannot read the
// frontend's route table — but a miss on either side is a real break, not a
// theoretical one: /usage was missing, which made the console layout read that
// path as a workspace named "usage" and clear the workspace it was showing.
// web/lib/paths.test.mjs asserts the mirror image of this from the route tree,
// so a new page fails one of the two.
func TestReservedSlugsCoverSystemRoutes(t *testing.T) {
	systemRoutes := []string{
		"login", "auth", "daemon", "daemons",
		"workspaces", "settings", "usage", "new", "api",
	}
	for _, slug := range systemRoutes {
		if !isReservedSlug(slug) {
			t.Errorf("isReservedSlug(%q) = false, but /%s is a top-level route", slug, slug)
		}
	}

	// A workspace named after a system page must not be able to claim its path.
	for _, name := range []string{"Usage", "Settings", "Daemons", "Workspaces"} {
		if slug := deriveSlug(name); !isReservedSlug(slug) {
			t.Errorf("a workspace named %q derives slug %q, which is not reserved", name, slug)
		}
	}

	// Ordinary names stay available.
	for _, slug := range []string{"acme-platform", "usage-report", "my-usage", "settings-sync"} {
		if isReservedSlug(slug) {
			t.Errorf("isReservedSlug(%q) = true, want an ordinary workspace slug to be allowed", slug)
		}
	}
}
